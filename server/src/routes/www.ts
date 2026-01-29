// WWW handler - serves a specific project on www and root domain
// URLs: www.example.com/* or example.com/*
//
// The project is specified by the WWW_PROJECT_ID environment variable.
// If not set or set to "_", returns 404 for all requests.
//
// Visibility enforcement:
// - Public projects: served immediately
// - Non-public projects: require content token (project-scoped JWT)
// - Share tokens: provide anonymous access
// - Missing project or no access: 404

import { Hono } from 'hono'
import type { Env } from '../env'
import { createDbClient } from '../db/client'
import {
  type Project,
  validateFilePath,
  serveProjectContent,
} from '../lib/content-serving'

export const wwwRoutes = new Hono<{ Bindings: Env }>({ strict: true })

// GET requests for static file serving
wwwRoutes.get('*', async (c) => {
  // Check if WWW_PROJECT_ID is configured
  const wwwProjectId = c.env.WWW_PROJECT_ID
  if (!wwwProjectId || wwwProjectId === '_') {
    return c.text('Not Found', 404)
  }

  const url = new URL(c.req.url)
  const pathname = url.pathname

  // Redirect .mdx URLs to .md (CLI renames .mdx to .md when copying)
  if (pathname.endsWith('.mdx')) {
    const redirectUrl = new URL(url)
    redirectUrl.pathname = pathname.slice(0, -4) + '.md'
    return c.redirect(redirectUrl.toString(), 301)
  }

  // Normalize pathname for www routes:
  // - Remove leading slash for file path validation
  // - Root "/" becomes empty string (will serve index.html)
  const rawFilePath = pathname.replace(/^\/+/, '')

  // Validate file path (only if non-empty, empty is valid for root)
  let filePath: string = rawFilePath
  if (rawFilePath) {
    const validated = validateFilePath(rawFilePath)
    if (validated === null) {
      return c.text('Not Found', 404)
    }
    filePath = validated
  }

  const db = createDbClient(c.env.DB)

  // Look up project by ID
  let project: Project | undefined
  try {
    const [row] = (await db`
      SELECT p.id, p.name, p.owner_id, u.email as owner_email, p.visibility, p.live_deploy_id
      FROM projects p
      JOIN "user" u ON p.owner_id = u.id
      WHERE p.id = ${wwwProjectId}
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
  // Use "/" as cookie path since www routes serve at root
  return serveProjectContent(c, project, filePath, {
    cookiePath: '/',
    enableCaching: true,
  })
})
