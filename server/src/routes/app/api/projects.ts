import { Hono } from 'hono'
import type { Env } from '../../../env'
import { createDbClient } from '../../../db/client'
import { generateId } from '../../../lib/id'
import {
  validateProjectName,
  getEmailLocalPart,
  isSingleDomainAllowedUsers,
} from '@scratch/shared/project'
import { parseGroup, validateGroupInput } from '@scratch/shared'
import { visibilityExceedsMax } from '../../../lib/visibility'
import { getAuthenticatedUser, formatProject, type ProjectRow } from '../../../lib/api-helpers'
import { getContentBaseUrl } from '../../../lib/domains'

export const projectRoutes = new Hono<{ Bindings: Env }>({ strict: true })

// POST /api/projects - Create a new project
projectRoutes.post('/projects', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const body = (await c.req.json()) as { name?: string }
  const { name } = body

  if (!name) {
    return c.json({ error: 'Name is required', code: 'PROJECT_NAME_INVALID' }, 400)
  }

  // Validate name
  const nameValidation = validateProjectName(name)
  if (!nameValidation.valid) {
    return c.json({ error: nameValidation.error, code: 'PROJECT_NAME_INVALID' }, 400)
  }

  const db = createDbClient(c.env.DB)
  const projectId = generateId()

  try {
    await db`
      INSERT INTO projects (id, name, owner_id, visibility, created_at, updated_at)
      VALUES (${projectId}, ${name}, ${auth.userId}, 'public', datetime('now'), datetime('now'))
    `
  } catch (err: any) {
    // Check for unique constraint violation
    if (err.message?.includes('idx_projects_name_owner') || err.code === '23505') {
      return c.json({ error: 'You already have a project with this name', code: 'PROJECT_NAME_TAKEN' }, 409)
    }
    throw err
  }

  const [project] = (await db`
    SELECT p.*, u.email as owner_email
    FROM projects p
    JOIN "user" u ON p.owner_id = u.id
    WHERE p.id = ${projectId}
  `) as (ProjectRow & { owner_email: string })[]

  return c.json({ project: formatProject(project, c.env) }, 201)
})

// GET /api/projects - List user's projects
projectRoutes.get('/projects', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const db = createDbClient(c.env.DB)

  // Get projects with live version derived from live_deploy_id
  // Uses GROUP BY to avoid N+1 subqueries for deploy_count and last_deploy_at
  const projects = (await db`
    SELECT
      p.*,
      u.email as owner_email,
      d.version as live_version,
      CAST(COUNT(all_d.id) AS INTEGER) as deploy_count,
      MAX(all_d.created_at) as last_deploy_at
    FROM projects p
    JOIN "user" u ON p.owner_id = u.id
    LEFT JOIN deploys d ON p.live_deploy_id = d.id
    LEFT JOIN deploys all_d ON all_d.project_id = p.id
    WHERE p.owner_id = ${auth.userId}
    GROUP BY p.id, u.email, d.version
    ORDER BY p.updated_at DESC
  `) as (ProjectRow & { owner_email: string; live_version: number | null; deploy_count: number; last_deploy_at: string | null })[]

  return c.json({
    projects: projects.map((p) =>
      formatProject(p, c.env, {
        live_version: p.live_version,
        deploy_count: p.deploy_count,
        last_deploy_at: p.last_deploy_at,
      })
    ),
  })
})

// GET /api/projects/:name - Get project details
projectRoutes.get('/projects/:name', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const name = c.req.param('name')

  const db = createDbClient(c.env.DB)

  // Uses GROUP BY to avoid N+1 subqueries for deploy_count and last_deploy_at
  const [project] = (await db`
    SELECT
      p.*,
      u.email as owner_email,
      d.version as live_version,
      CAST(COUNT(all_d.id) AS INTEGER) as deploy_count,
      MAX(all_d.created_at) as last_deploy_at
    FROM projects p
    JOIN "user" u ON p.owner_id = u.id
    LEFT JOIN deploys d ON p.live_deploy_id = d.id
    LEFT JOIN deploys all_d ON all_d.project_id = p.id
    WHERE p.name = ${name}
      AND p.owner_id = ${auth.userId}
    GROUP BY p.id, u.email, d.version
  `) as (ProjectRow & { owner_email: string; live_version: number | null; deploy_count: number; last_deploy_at: string | null })[]

  if (!project) {
    return c.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' }, 404)
  }

  return c.json({
    project: formatProject(project, c.env, {
      live_version: project.live_version,
      deploy_count: project.deploy_count,
      last_deploy_at: project.last_deploy_at,
    }),
  })
})

// PATCH /api/projects/:name - Update project (visibility)
projectRoutes.patch('/projects/:name', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const name = c.req.param('name')

  const body = (await c.req.json()) as { visibility?: string }

  // Validate that we have something to update
  if (!body.visibility) {
    return c.json({ error: 'No valid fields to update', code: 'INVALID_REQUEST' }, 400)
  }

  const db = createDbClient(c.env.DB)

  // Get project to verify ownership
  const [project] = (await db`
    SELECT id FROM projects
    WHERE name = ${name}
      AND owner_id = ${auth.userId}
  `) as { id: string }[]

  if (!project) {
    return c.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' }, 404)
  }

  // Validate input format before parsing
  const inputError = validateGroupInput(body.visibility)
  if (inputError) {
    return c.json({ error: inputError, code: 'VISIBILITY_INVALID' }, 400)
  }

  // Parse validated input
  const visibility = parseGroup(body.visibility)

  // Check MAX_VISIBILITY ceiling
  if (visibilityExceedsMax(visibility, c.env)) {
    return c.json(
      { error: 'Visibility cannot exceed server maximum', code: 'VISIBILITY_EXCEEDS_MAX' },
      400
    )
  }

  // Store visibility as string in DB
  // For arrays, store as comma-separated
  const visibilityStr = Array.isArray(visibility) ? visibility.join(',') : visibility

  // Update project visibility
  await db`
    UPDATE projects
    SET visibility = ${visibilityStr}, updated_at = datetime('now')
    WHERE id = ${project.id}
  `

  // Note: With session-based auth (cross-subdomain cookies), there's no need to
  // revoke access tokens when visibility changes. The next request will check
  // the updated visibility against the user's session.

  // Fetch updated project with all details
  const [updatedProject] = (await db`
    SELECT
      p.*,
      u.email as owner_email,
      d.version as live_version,
      CAST(COUNT(all_d.id) AS INTEGER) as deploy_count,
      MAX(all_d.created_at) as last_deploy_at
    FROM projects p
    JOIN "user" u ON p.owner_id = u.id
    LEFT JOIN deploys d ON p.live_deploy_id = d.id
    LEFT JOIN deploys all_d ON all_d.project_id = p.id
    WHERE p.id = ${project.id}
    GROUP BY p.id, u.email, d.version
  `) as (ProjectRow & { owner_email: string; live_version: number | null; deploy_count: number; last_deploy_at: string | null })[]

  return c.json({
    project: formatProject(updatedProject, c.env, {
      live_version: updatedProject.live_version,
      deploy_count: updatedProject.deploy_count,
      last_deploy_at: updatedProject.last_deploy_at,
    }),
  })
})

// DELETE /api/projects/:name - Delete project and all deploys
projectRoutes.delete('/projects/:name', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const name = c.req.param('name')

  const db = createDbClient(c.env.DB)

  // Get project to verify ownership and get deploy IDs for R2 cleanup
  const [project] = (await db`
    SELECT id FROM projects
    WHERE name = ${name}
      AND owner_id = ${auth.userId}
  `) as { id: string }[]

  if (!project) {
    return c.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' }, 404)
  }

  // Get all deploy IDs for R2 cleanup
  const deploys = (await db`SELECT id FROM deploys WHERE project_id = ${project.id}`) as { id: string }[]

  // Delete files from R2 for each deploy (batched for performance)
  const BATCH_SIZE = 10
  for (const deploy of deploys) {
    const listed = await c.env.FILES.list({ prefix: `${deploy.id}/` })
    for (let i = 0; i < listed.objects.length; i += BATCH_SIZE) {
      const batch = listed.objects.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map((obj) => c.env.FILES.delete(obj.key)))
    }
  }

  // Delete project (CASCADE handles deploys)
  await db`DELETE FROM projects WHERE id = ${project.id}`

  // Invalidate cache for deleted project
  const cache = caches.default
  const contentBaseUrl = getContentBaseUrl(c.env)

  // Build cache keys for all URL formats
  const singleDomain = isSingleDomainAllowedUsers(c.env.ALLOWED_USERS || '')
  const localPart = getEmailLocalPart(auth.user.email)
  const email = auth.user.email.toLowerCase()

  const baseUrls = [
    `${contentBaseUrl}/${auth.userId}/${name}`,
    `${contentBaseUrl}/${email}/${name}`,
  ]
  if (singleDomain && localPart) {
    baseUrls.push(`${contentBaseUrl}/${localPart}/${name}`)
  }

  // Purge common paths for all URL formats
  const purgePromises = baseUrls.flatMap((baseUrl) => [
    cache.delete(new Request(`${baseUrl}/`)),
    cache.delete(new Request(`${baseUrl}/index.html`)),
  ])
  await Promise.all(purgePromises)

  return c.body(null, 204)
})
