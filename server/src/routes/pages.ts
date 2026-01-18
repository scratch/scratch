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
import type { Env } from '../env'
import { createDbClient } from '../db/client'
import { parsePagePath, isSingleDomainAllowedUsers } from '@scratch/shared/project'
import {
  type Project,
  validateFilePath,
  serveProjectContent,
} from '../lib/content-serving'

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

  if (!project) {
    return c.text('Not Found', 404)
  }

  // Serve the project content
  return serveProjectContent(c, project, filePath, {
    cookiePath: getCookiePath(ownerIdentifier, projectName),
    enableCaching: true,
  })
})
