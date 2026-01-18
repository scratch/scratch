// Shared content serving utilities for pages and www routes
// Handles file lookup, serving, and authentication for static content

import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { Env } from '../env'
import { createDbClient } from '../db/client'
import { getContentType, getCacheControl, getSecurityHeaders, normalizePath, isValidFilePath } from './files'
import { isPublicProject, canAccessProject } from './visibility'
import { getOrCreateCloudflareAccessUser } from './cloudflare-access'
import { isShareTokensEnabled, validateShareToken } from './share-tokens'
import { verifyContentToken } from './content-token'
import { getAppBaseUrl, useHttps } from './domains'

export interface Project {
  id: string
  name: string
  owner_id: string
  owner_email: string
  visibility: string
  live_deploy_id: string | null
}

// Try multiple paths in R2 to find a file (clean URLs, index.html)
// Uses parallel fetches for better performance
export async function findFile(
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
export function serveFile(object: R2ObjectBody, key: string, extraHeaders?: Headers): Response {
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
export function buildContentAccessRedirect(env: Env, projectId: string, returnUrl: string): string {
  const appBaseURL = getAppBaseUrl(env)
  const contentAccessUrl = new URL('/auth/content-access', appBaseURL)
  contentAccessUrl.searchParams.set('project_id', projectId)
  contentAccessUrl.searchParams.set('return_url', returnUrl)
  return contentAccessUrl.toString()
}

// Validate and decode file path, returns null if invalid
export function validateFilePath(rawFilePath: string): string | null {
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(rawFilePath)
  } catch {
    return null // Invalid URL encoding
  }
  const filePath = normalizePath(decodedPath)
  if (filePath && !isValidFilePath(filePath)) {
    return null // Path validation failed
  }
  return filePath
}

// Authentication result from content auth flow
export interface ContentAuthResult {
  user: { id: string; email: string } | null
  hasAccess: boolean
}

// Authenticate a content request for a specific project
// Handles content tokens, share tokens, and Cloudflare Access
export async function authenticateContentRequest(
  c: Context<{ Bindings: Env }>,
  project: Project,
  cookiePath: string
): Promise<ContentAuthResult> {
  const url = new URL(c.req.url)
  let verifiedUser: { id: string; email: string } | null = null

  if (c.env.AUTH_MODE === 'cloudflare-access') {
    // Cloudflare Access mode: get user from CF JWT
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

    if (token) {
      const verified = await verifyContentToken(token, project.id, c.env.BETTER_AUTH_SECRET)
      if (verified) {
        verifiedUser = { id: verified.userId, email: verified.email }

        // Set cookie if token came from URL (first visit after auth)
        if (tokenFromUrl) {
          const isHttps = useHttps(c.env)
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
  if (verifiedUser) {
    hasAccess = canAccessProject(verifiedUser.email, verifiedUser.id, project, c.env)
  }

  // Check for share token (anonymous access) - only if feature is enabled and no user access
  if (!hasAccess && isShareTokensEnabled(c.env)) {
    const db = createDbClient(c.env.DB)
    const shareTokenCookieName = `_share_${project.id}`
    const shareTokenFromCookie = getCookie(c, shareTokenCookieName)
    const shareTokenFromUrl = url.searchParams.get('token')
    const shareToken = shareTokenFromUrl || shareTokenFromCookie

    if (shareToken) {
      const shareResult = await validateShareToken(db, shareToken)
      if (shareResult && shareResult.projectId === project.id) {
        hasAccess = true

        // Set cookie so subsequent requests (assets) don't need the token param
        if (shareTokenFromUrl && !shareTokenFromCookie) {
          const isHttps = useHttps(c.env)
          setCookie(c, shareTokenCookieName, shareToken, {
            path: cookiePath,
            httpOnly: true,
            secure: isHttps,
            sameSite: 'Lax',
            maxAge: 60 * 60 * 24, // 24 hours (or until token expires/revoked)
          })
        }
      }
    }
  }

  return { user: verifiedUser, hasAccess }
}

// Options for serving project content
export interface ServeContentOptions {
  // Cookie path for auth tokens (e.g., "/{owner}/{project}/")
  cookiePath: string
  // Whether to cache the response (only for public projects)
  enableCaching?: boolean
}

// Serve content for a project, handling auth and file lookup
// Returns a Response or null if redirect/error handling is needed
export async function serveProjectContent(
  c: Context<{ Bindings: Env }>,
  project: Project,
  filePath: string,
  options: ServeContentOptions
): Promise<Response> {
  const url = new URL(c.req.url)
  const hasShareToken = url.searchParams.has('token')
  const cache = caches.default
  const cacheKey = new Request(url.toString(), { method: 'GET' })

  // Check if public
  const isPublic = isPublicProject(project.visibility, c.env)

  // Try cache first for public requests without share tokens
  if (isPublic && options.enableCaching && !hasShareToken) {
    const cached = await cache.match(cacheKey)
    if (cached) {
      return cached
    }
  }

  if (!isPublic) {
    const authResult = await authenticateContentRequest(c, project, options.cookiePath)

    if (!authResult.hasAccess) {
      // No valid token - redirect to app for content access token
      if (!authResult.user) {
        return c.redirect(buildContentAccessRedirect(c.env, project.id, c.req.url))
      }

      // Has token but no access (permissions changed? wrong user?)
      return c.text('Not Found', 404)
    }
  }

  // Check for live deploy
  if (!project.live_deploy_id) {
    return c.text('Not Found', 404)
  }

  // Find and serve file from R2
  const result = await findFile(c.env.FILES, project.live_deploy_id, filePath)

  if (!result) {
    return c.text('Not Found', 404)
  }

  const response = serveFile(result.object, result.key, c.res.headers)

  // Cache public project 200 responses (no share tokens in URL)
  if (isPublic && options.enableCaching && response.status === 200 && !hasShareToken) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  }

  return response
}
