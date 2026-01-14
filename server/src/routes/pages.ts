// Pages handler - serves static files for published projects on content subdomain
// URLs: /{owner-identifier}/{project-name}/{path}
//
// Owner identifier can be:
// - User ID: always works
// - Email: always works (case-insensitive)
// - Email local part: only when ALLOWED_USERS is a single domain
//
// Visibility enforcement:
// - Public projects: served immediately
// - Non-public projects: require content token (project-scoped JWT)
// - Share tokens: provide anonymous access for specific projects
// - Unknown/missing projects: 404 (don't reveal existence)

import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { Env } from '../env'
import { createDbClient } from '../db/client'
import { getContentType, getCacheControl, getSecurityHeaders, normalizePath, isValidFilePath } from '../lib/files'
import { isPublicProject, canAccessProject } from '../lib/visibility'
import { getOrCreateCloudflareAccessUser } from '../lib/cloudflare-access'
import {
  isShareTokensEnabled,
  validateShareToken,
} from '../lib/share-tokens'
import { verifyContentToken } from '../lib/content-token'
import { parsePagePath, isSingleDomainAllowedUsers } from '@scratch/shared/project'
import { getAppBaseUrl, useHttps } from '../lib/domains'

export const pagesRoutes = new Hono<{ Bindings: Env }>({ strict: true })

interface Project {
  id: string
  name: string
  owner_id: string
  owner_email: string
  visibility: string
  live_deploy_id: string | null
}

// Try multiple paths in R2 to find a file (clean URLs, index.html)
// Uses parallel fetches for better performance
async function findFile(
  r2: R2Bucket,
  deployId: string,
  path: string
): Promise<{ object: R2ObjectBody; key: string } | null> {
  // Normalize path - remove leading/trailing slashes
  const normalizedPath = path.replace(/^\/+|\/+$/g, '')

  // Paths to try in priority order
  const pathsToTry: string[] =
    normalizedPath === ''
      ? [`${deployId}/index.html`]
      : [
          `${deployId}/${normalizedPath}/index.html`,
          `${deployId}/${normalizedPath}.html`,
          `${deployId}/${normalizedPath}`,
        ]

  // Fetch all paths in parallel
  const results = await Promise.all(
    pathsToTry.map(async (key) => {
      const object = await r2.get(key)
      return object ? { object, key } : null
    })
  )

  // Return first match (maintains priority order)
  return results.find((r) => r !== null) ?? null
}

// Serve a file from R2 with appropriate headers
function serveFile(object: R2ObjectBody, key: string, extraHeaders?: Headers): Response {
  const contentType = getContentType(key)
  const cacheControl = getCacheControl(key)
  const securityHeaders = getSecurityHeaders()

  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    ...securityHeaders,
  })

  // Add etag if available
  if (object.etag) {
    headers.set('ETag', object.etag)
  }

  // Copy extra headers (e.g., Set-Cookie from Hono context)
  if (extraHeaders) {
    extraHeaders.forEach((value, name) => {
      headers.append(name, value)
    })
  }

  return new Response(object.body, { headers })
}

// Build redirect URL to app subdomain for content access token
// User will authenticate on app subdomain, then redirect back with a project-scoped token
function buildContentAccessRedirect(env: Env, projectId: string, returnUrl: string): string {
  const appBaseURL = getAppBaseUrl(env)
  const contentAccessUrl = new URL('/auth/content-access', appBaseURL)
  contentAccessUrl.searchParams.set('project_id', projectId)
  contentAccessUrl.searchParams.set('return_url', returnUrl)
  return contentAccessUrl.toString()
}

// Get cookie path for a project (based on owner identifier and project name)
function getCookiePath(ownerIdentifier: string, projectName: string): string {
  return `/${ownerIdentifier}/${projectName}/`
}

// Resolve owner identifier to user ID
// Tries: user ID, email, or local-part (if single domain)
async function resolveOwnerId(
  db: ReturnType<typeof createDbClient>,
  ownerIdentifier: string,
  allowedUsers: string
): Promise<string | null> {
  // 1. Try as user ID
  const [byId] = await db`SELECT id FROM "user" WHERE id = ${ownerIdentifier}` as { id: string }[]
  if (byId) {
    return byId.id
  }

  // 2. Try as email (case-insensitive)
  const [byEmail] = await db`SELECT id FROM "user" WHERE lower(email) = ${ownerIdentifier.toLowerCase()}` as { id: string }[]
  if (byEmail) {
    return byEmail.id
  }

  // 3. Try as local-part if single domain allowed
  const singleDomain = isSingleDomainAllowedUsers(allowedUsers)
  if (singleDomain) {
    const fullEmail = `${ownerIdentifier.toLowerCase()}@${singleDomain}`
    const [byLocalPart] = await db`SELECT id FROM "user" WHERE lower(email) = ${fullEmail}` as { id: string }[]
    if (byLocalPart) {
      return byLocalPart.id
    }
  }

  return null
}

// GET requests for static file serving
pagesRoutes.get('*', async (c) => {
  const url = new URL(c.req.url)
  const pathname = url.pathname

  // Redirect /{owner}/{project} to /{owner}/{project}/
  // Preserve query params (e.g., ?_access=token) during redirect
  if (pathname.match(/^\/[^/]+\/[^/]+$/) && !pathname.endsWith('/')) {
    const redirectUrl = new URL(url)
    redirectUrl.pathname = pathname + '/'
    return c.redirect(redirectUrl.toString(), 301)
  }

  // Skip cache for requests with share tokens (anonymous access flow)
  // Share tokens in URL need special handling to set cookies
  const hasShareToken = url.searchParams.has('token')
  const cache = caches.default
  const cacheKey = new Request(url.toString(), { method: 'GET' })

  // Try cache first for requests without share tokens
  // Note: Session-based auth doesn't need URL tokens - cookies handle it
  if (!hasShareToken) {
    const cached = await cache.match(cacheKey)
    if (cached) {
      return cached
    }
  }

  // Parse the path
  const parsed = parsePagePath(pathname)
  if (!parsed || !parsed.projectName) {
    return c.text('Not Found', 404)
  }

  const { ownerIdentifier, projectName, filePath: rawFilePath } = parsed

  // Validate file path to prevent path traversal
  // Decode first to catch encoded traversal sequences like %2e%2e
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(rawFilePath)
  } catch {
    return c.text('Not Found', 404) // Invalid URL encoding
  }
  const filePath = normalizePath(decodedPath)
  if (filePath && !isValidFilePath(filePath)) {
    return c.text('Not Found', 404) // Don't reveal path validation exists
  }

  const db = createDbClient(c.env.DB)

  // Resolve owner identifier to user ID
  const ownerId = await resolveOwnerId(db, ownerIdentifier, c.env.ALLOWED_USERS || '')
  if (!ownerId) {
    return c.text('Not Found', 404)
  }

  // Look up project with visibility info
  let project: Project | undefined
  try {
    const [row] = (await db`
      SELECT p.id, p.name, p.owner_id, u.email as owner_email, p.visibility, p.live_deploy_id
      FROM projects p
      JOIN "user" u ON p.owner_id = u.id
      WHERE p.name = ${projectName} AND p.owner_id = ${ownerId}
    `) as Project[]
    project = row
  } catch (err) {
    console.error('Database error:', err)
    return c.text('Internal Server Error', 500)
  }

  // Security: For non-public requests (including missing projects), redirect to auth
  // This prevents attackers from distinguishing "doesn't exist" from "exists but private"
  const isPublic = project && isPublicProject(project.visibility, c.env)

  if (!isPublic) {
    let verifiedUser: { id: string; email: string } | null = null

    if (c.env.AUTH_MODE === 'cloudflare-access') {
      // Cloudflare Access mode: get user from CF JWT (unchanged)
      const cfUser = await getOrCreateCloudflareAccessUser(c.req.raw, c.env)
      if (cfUser) {
        verifiedUser = { id: cfUser.id, email: cfUser.email }
      }
    } else {
      // Content token auth (replaces cross-subdomain session cookies)
      // Token is project-scoped and stored in a path-scoped cookie
      const contentTokenCookieName = '_content_token'
      const tokenFromCookie = getCookie(c, contentTokenCookieName)
      const tokenFromUrl = url.searchParams.get('_ctoken')
      const token = tokenFromUrl || tokenFromCookie

      if (token && project) {
        const verified = await verifyContentToken(token, project.id, c.env.BETTER_AUTH_SECRET)
        if (verified) {
          verifiedUser = { id: verified.userId, email: verified.email }

          // Set cookie if token came from URL (first visit after auth)
          if (tokenFromUrl) {
            const isHttps = useHttps(c.env)
            const cookiePath = getCookiePath(ownerIdentifier, projectName)
            setCookie(c, contentTokenCookieName, token, {
              path: cookiePath,
              httpOnly: true,
              secure: isHttps,
              sameSite: 'Lax',
              maxAge: 60 * 60, // 1 hour (matches token expiry)
            })
          }
        }
      }
    }

    let hasAccess = false

    // Check if authenticated user has access to this project
    if (verifiedUser && project) {
      hasAccess = canAccessProject(verifiedUser.email, verifiedUser.id, project, c.env)
    }

    // Check for share token (anonymous access) - only if feature is enabled and no user access
    if (!hasAccess && isShareTokensEnabled(c.env)) {
      const shareTokenCookieName = `_share_${ownerIdentifier}_${projectName}`
      const shareTokenFromCookie = getCookie(c, shareTokenCookieName)
      const shareTokenFromUrl = url.searchParams.get('token')
      const shareToken = shareTokenFromUrl || shareTokenFromCookie

      if (shareToken) {
        const shareResult = await validateShareToken(db, shareToken)
        if (shareResult && project && shareResult.projectId === project.id) {
          hasAccess = true

          // Set cookie so subsequent requests (assets) don't need the token param
          if (shareTokenFromUrl && !shareTokenFromCookie) {
            const isHttps = useHttps(c.env)
            setCookie(c, shareTokenCookieName, shareToken, {
              path: getCookiePath(ownerIdentifier, projectName),
              httpOnly: true,
              secure: isHttps,
              sameSite: 'Lax',
              maxAge: 60 * 60 * 24, // 24 hours (or until token expires/revoked)
            })
          }
        }
      }
    }

    if (!hasAccess) {
      // No project found - 404 (nothing to authorize)
      if (!project) {
        return c.text('Not Found', 404)
      }

      // No valid token - redirect to app for content access token
      if (!verifiedUser) {
        return c.redirect(buildContentAccessRedirect(c.env, project.id, c.req.url))
      }

      // Has token but no access (permissions changed? wrong user?)
      return c.text('Not Found', 404)
    }
  }

  // At this point we have access - serve the file
  // For public projects, we serve without token check
  // For private projects with valid cookie, we serve

  if (!project) {
    // This shouldn't happen (would have redirected above), but be safe
    return c.text('Not Found', 404)
  }

  if (!project.live_deploy_id) {
    // Project exists but no live deploy
    return c.text('Not Found', 404)
  }

  // Find and serve file from R2
  const result = await findFile(c.env.FILES, project.live_deploy_id, filePath)

  if (!result) {
    return c.text('Not Found', 404)
  }

  const response = serveFile(result.object, result.key, c.res.headers)

  // Cache public project 200 responses (no share tokens in URL)
  if (isPublic && response.status === 200 && !hasShareToken) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  }

  return response
})
