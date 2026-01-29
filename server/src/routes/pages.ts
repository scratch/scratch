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
// - Unknown/missing projects: redirect to auth (same as private), then error
//   This prevents attackers from distinguishing "doesn't exist" from "private"

import { Hono } from 'hono'
import type { Env } from '../env'
import { createDbClient } from '../db/client'
import { parsePagePath, isSingleDomainAllowedUsers } from '@scratch/shared/project'
import {
  type Project,
  validateFilePath,
  serveProjectContent,
  buildContentAccessRedirect,
} from '../lib/content-serving'
import { isPublicProject } from '../lib/visibility'

export const pagesRoutes = new Hono<{ Bindings: Env }>({ strict: true })

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

// Get cookie path for a project (based on owner identifier and project name)
function getCookiePath(ownerIdentifier: string, projectName: string): string {
  return `/${ownerIdentifier}/${projectName}/`
}

// Generate a synthetic project ID for non-existent projects
// This is used to redirect to auth without revealing that the project doesn't exist
// Uses a deterministic hash so the same path always produces the same ID
async function generateSyntheticProjectId(ownerIdentifier: string, projectName: string): Promise<string> {
  const data = new TextEncoder().encode(`${ownerIdentifier}/${projectName}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  // Convert to base36 and take first 21 chars (matches nanoid format)
  let result = ''
  for (const byte of hashArray) {
    result += byte.toString(36)
  }
  return result.substring(0, 21)
}

// GET requests for static file serving
pagesRoutes.get('*', async (c) => {
  const url = new URL(c.req.url)
  const pathname = url.pathname

  // Redirect .mdx URLs to .md (CLI renames .mdx to .md when copying)
  if (pathname.endsWith('.mdx')) {
    const redirectUrl = new URL(url)
    redirectUrl.pathname = pathname.slice(0, -4) + '.md'
    return c.redirect(redirectUrl.toString(), 301)
  }

  // Redirect /{owner}/{project} to /{owner}/{project}/
  // Preserve query params (e.g., ?_access=token) during redirect
  if (pathname.match(/^\/[^/]+\/[^/]+$/) && !pathname.endsWith('/')) {
    const redirectUrl = new URL(url)
    redirectUrl.pathname = pathname + '/'
    return c.redirect(redirectUrl.toString(), 301)
  }

  // Parse the path
  const parsed = parsePagePath(pathname)
  if (!parsed || !parsed.projectName) {
    return c.text('Not Found', 404)
  }

  const { ownerIdentifier, projectName, filePath: rawFilePath } = parsed

  // Validate file path
  const filePath = validateFilePath(rawFilePath)
  if (filePath === null) {
    return c.text('Not Found', 404)
  }

  const db = createDbClient(c.env.DB)

  // Resolve owner identifier to user ID
  const ownerId = await resolveOwnerId(db, ownerIdentifier, c.env.ALLOWED_USERS || '')

  // Look up project with visibility info (only if owner exists)
  let project: Project | undefined
  if (ownerId) {
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
  }

  // If project exists and is public, serve immediately
  if (project && isPublicProject(project.visibility, c.env)) {
    return serveProjectContent(c, project, filePath, {
      cookiePath: getCookiePath(ownerIdentifier, projectName),
      enableCaching: true,
    })
  }

  // For non-public or non-existent projects, use the same auth flow
  // This prevents attackers from distinguishing "doesn't exist" from "private"
  if (project) {
    // Project exists but is non-public - use real project ID
    return serveProjectContent(c, project, filePath, {
      cookiePath: getCookiePath(ownerIdentifier, projectName),
      enableCaching: false,
    })
  }

  // Project doesn't exist - redirect to auth with synthetic ID
  // After auth, content-access will fail to find the project and show generic error
  const syntheticId = await generateSyntheticProjectId(ownerIdentifier, projectName)
  return c.redirect(buildContentAccessRedirect(c.env, syntheticId, c.req.url))
})
