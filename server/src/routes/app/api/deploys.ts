import { Hono } from 'hono'
import type { Env } from '../../../env'
import { createDbClient } from '../../../db/client'
import { generateId } from '../../../lib/id'
import { validateProjectName, buildProjectUrls } from '@scratch/shared/project'
import { deployCreateQuerySchema } from '@scratch/shared'
import { normalizePath, isValidFilePath } from '../../../lib/files'
import { unzip } from 'unzipit'
import { getAuthenticatedUser, parseAndValidateVisibility, type DeployRow } from '../../../lib/api-helpers'
import { getContentDomain, getRootDomain } from '../../../lib/domains'
import { invalidateProjectCache } from '../../../lib/cache'

export const deployRoutes = new Hono<{ Bindings: Env }>({ strict: true })

// POST /api/projects/:name/deploy - Deploy a project (upload zip)
deployRoutes.post('/projects/:name/deploy', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const name = c.req.param('name')

  // Parse query params with shared schema
  const queryResult = deployCreateQuerySchema.safeParse({
    visibility: c.req.query('visibility'),
    project_id: c.req.query('project_id'),
    www: c.req.query('www'),
  })
  if (!queryResult.success) {
    return c.json({ error: 'Invalid query parameters', code: 'INVALID_PARAMS' }, 400)
  }
  const { visibility: rawVisibility, project_id: projectIdParam, www: wwwMode } = queryResult.data

  // Validate project name
  const nameValidation = validateProjectName(name)
  if (!nameValidation.valid) {
    return c.json({ error: nameValidation.error, code: 'PROJECT_NAME_INVALID' }, 400)
  }

  // Validate and parse visibility (defaults to 'public' if not provided)
  const visResult = parseAndValidateVisibility(rawVisibility, c.env)
  if (!visResult.valid) {
    return c.json({ error: visResult.error, code: visResult.code }, 400)
  }
  const projectVisibility = visResult.value

  // Get deploy size limit
  const maxDeploySizeMB = parseInt(c.env.MAX_DEPLOY_SIZE || '1', 10)
  const maxDeploySizeBytes = maxDeploySizeMB * 1024 * 1024
  // Zip bomb protection: 10x ratio cap AND absolute 100MB max
  const MAX_EXTRACTED_ABSOLUTE = 100 * 1024 * 1024
  const maxExtractedBytes = Math.min(maxDeploySizeBytes * 10, MAX_EXTRACTED_ABSOLUTE)

  // Check content type
  const contentType = c.req.header('content-type')
  if (!contentType?.includes('application/zip') && !contentType?.includes('application/octet-stream')) {
    return c.json({ error: 'Content-Type must be application/zip', code: 'INVALID_ZIP' }, 400)
  }

  // Get zip data
  const zipData = await c.req.arrayBuffer()

  // Check zip size
  if (zipData.byteLength > maxDeploySizeBytes) {
    return c.json(
      { error: `Deploy too large (max ${maxDeploySizeMB} MB)`, code: 'DEPLOY_TOO_LARGE' },
      413
    )
  }

  // Extract zip
  let entries: {
    [key: string]: {
      blob: () => Promise<Blob>
      isDirectory: boolean
      externalFileAttributes: number
      versionMadeBy: number
    }
  }
  try {
    const result = await unzip(zipData)
    entries = result.entries
  } catch (err) {
    return c.json({ error: 'Invalid zip file', code: 'INVALID_ZIP' }, 400)
  }

  // Helper to detect symlinks in Unix-created zips
  // Unix file mode is in upper 16 bits of externalFileAttributes
  // S_IFLNK (symlink) = 0xA000
  const isSymlink = (entry: { externalFileAttributes: number; versionMadeBy: number }) => {
    const isUnix = (entry.versionMadeBy >> 8) === 3
    if (!isUnix) return false
    const unixMode = (entry.externalFileAttributes >> 16) & 0xf000
    return unixMode === 0xa000
  }

  // Validate and collect files
  const files: { path: string; data: Uint8Array }[] = []
  let totalExtractedBytes = 0
  let fileCount = 0

  for (const [rawPath, entry] of Object.entries(entries)) {
    if (entry.isDirectory) continue

    // Reject symlinks
    if (isSymlink(entry)) {
      return c.json({ error: 'Symbolic links not allowed', code: 'SYMLINK_NOT_ALLOWED' }, 400)
    }

    fileCount++
    if (fileCount > 10000) {
      return c.json({ error: 'Too many files (max 10,000)', code: 'TOO_MANY_FILES' }, 400)
    }

    // Normalize and validate path
    const path = normalizePath(rawPath)
    if (!isValidFilePath(path)) {
      return c.json({ error: `Invalid file path: ${rawPath}`, code: 'INVALID_PATH' }, 400)
    }

    // Get file data
    const blob = await entry.blob()
    const data = new Uint8Array(await blob.arrayBuffer())

    totalExtractedBytes += data.length
    if (totalExtractedBytes > maxExtractedBytes) {
      return c.json(
        { error: 'Extracted content too large (possible zip bomb)', code: 'EXTRACTED_TOO_LARGE' },
        400
      )
    }

    files.push({ path, data })
  }

  if (files.length === 0) {
    return c.json({ error: 'Cannot deploy empty archive', code: 'EMPTY_DEPLOY' }, 400)
  }

  const db = createDbClient(c.env.DB)
  const deployId = generateId()

  // Step 1: DB operations (returns discriminated union to avoid exception-based control flow)
  // Note: D1's single-writer model serializes all writes, making explicit locking unnecessary
  type DbResult =
    | { ok: true; projectId: string; version: number; projectCreated: boolean }
    | { ok: false; reason: 'PROJECT_NOT_FOUND' | 'PROJECT_NAME_TAKEN' }

  const dbResult = await (async (): Promise<DbResult> => {
    let projId: string
    let created = false

    if (projectIdParam) {
      // Project ID provided - look up by ID
      const [existingProject] = (await db`
        SELECT id, name, owner_id FROM projects
        WHERE id = ${projectIdParam}
      `) as { id: string; name: string; owner_id: string }[]

      if (!existingProject || existingProject.owner_id !== auth.userId) {
        // Project doesn't exist or owned by different user
        return { ok: false, reason: 'PROJECT_NOT_FOUND' }
      }

      projId = existingProject.id

      // Check if name changed (rename)
      if (existingProject.name !== name) {
        // Check if user already has a project with the new name
        const [nameConflict] = (await db`
          SELECT id FROM projects
          WHERE name = ${name} AND owner_id = ${auth.userId}
        `) as { id: string }[]

        if (nameConflict) {
          return { ok: false, reason: 'PROJECT_NAME_TAKEN' }
        }

        // Update project name
        await db`
          UPDATE projects
          SET name = ${name}, updated_at = datetime('now')
          WHERE id = ${projId}
        `
      }

      // Update visibility if provided
      if (rawVisibility) {
        await db`
          UPDATE projects
          SET visibility = ${projectVisibility}, updated_at = datetime('now')
          WHERE id = ${projId}
        `
      }
    } else {
      // No project ID - use existing behavior (lookup by name + owner, auto-create)
      const [existingProject] = (await db`
        SELECT id, owner_id FROM projects
        WHERE name = ${name} AND owner_id = ${auth.userId}
      `) as { id: string; owner_id: string }[]

      if (existingProject) {
        // Project exists - already owned by this user
        projId = existingProject.id

        // Update visibility if provided
        if (rawVisibility) {
          await db`
            UPDATE projects
            SET visibility = ${projectVisibility}, updated_at = datetime('now')
            WHERE id = ${projId}
          `
        }
      } else {
        // Auto-create project with specified or default visibility
        projId = generateId()
        await db`
          INSERT INTO projects (id, name, owner_id, visibility, created_at, updated_at)
          VALUES (${projId}, ${name}, ${auth.userId}, ${projectVisibility}, datetime('now'), datetime('now'))
        `
        created = true
      }
    }

    // Get next version number
    const [versionRow] = (await db`
      SELECT COALESCE(MAX(version), 0) + 1 as next_version
      FROM deploys WHERE project_id = ${projId}
    `) as { next_version: number }[]

    // Create deploy record (but don't set live_deploy_id yet!)
    await db`
      INSERT INTO deploys (id, project_id, version, file_count, total_bytes, created_at)
      VALUES (${deployId}, ${projId}, ${versionRow.next_version}, ${files.length}, ${totalExtractedBytes}, datetime('now'))
    `

    return { ok: true, projectId: projId, version: versionRow.next_version, projectCreated: created }
  })()

  // Handle errors from DB operations
  if (!dbResult.ok) {
    if (dbResult.reason === 'PROJECT_NOT_FOUND') {
      return c.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' }, 400)
    }
    // PROJECT_NAME_TAKEN
    return c.json({ error: 'Project name already taken', code: 'PROJECT_NAME_TAKEN' }, 400)
  }

  const { projectId, version, projectCreated } = dbResult

  // Validate WWW mode if requested
  // WWW_PROJECT_ID can be: undefined, "_" (disabled), or a project ID
  // - If not set or "_", any project can use --www (but won't be served at root until configured)
  // - If set to a project ID, only that project can use --www; others get WWW_PROJECT_MISMATCH
  let wwwConfigured = false
  if (wwwMode) {
    const wwwProjectId = c.env.WWW_PROJECT_ID
    // "_" is the convention for "disabled/not configured" in .vars files
    if (wwwProjectId && wwwProjectId !== '_' && wwwProjectId !== projectId) {
      return c.json({
        error: 'WWW_PROJECT_ID is already configured for a different project. ' +
               'Update your server configuration if you want to change which project is served at the root domain.',
        code: 'WWW_PROJECT_MISMATCH',
      }, 400)
    }
    // Project is configured for www only if WWW_PROJECT_ID explicitly matches
    wwwConfigured = wwwProjectId === projectId
  }

  // Step 2: Upload files to R2 (outside transaction - can't rollback R2)
  // Batch uploads with concurrency limit for performance
  const BATCH_SIZE = 10
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((file) => c.env.FILES.put(`${deployId}/${file.path}`, file.data))
    )
  }

  // Step 3: Only NOW make it live (after R2 success)
  await db`
    UPDATE projects
    SET live_deploy_id = ${deployId}, updated_at = datetime('now')
    WHERE id = ${projectId}
  `

  // Build URLs for response
  const urls = buildProjectUrls({
    pagesDomain: getContentDomain(c.env),
    projectName: name,
    ownerId: auth.userId,
    ownerEmail: auth.user.email,
    allowedUsers: c.env.ALLOWED_USERS || '',
    // Include www domain URL if www mode is requested and configured
    wwwDomain: wwwMode && wwwConfigured ? getRootDomain(c.env) : undefined,
  })

  // Step 4: Invalidate cache for this project (best-effort, don't block response)
  c.executionCtx.waitUntil(invalidateProjectCache(auth, name, c.env))

  return c.json(
    {
      deploy: {
        id: deployId,
        project_id: projectId,
        version,
        file_count: files.length,
        total_bytes: totalExtractedBytes,
        created_at: new Date().toISOString(),
      },
      project: {
        id: projectId,
        name,
        created: projectCreated,
      },
      urls,
      // Include www mode info when requested
      ...(wwwMode && {
        www: {
          configured: wwwConfigured,
          project_id: projectId,
        },
      }),
    },
    201
  )
})

// GET /api/projects/:name/deploys - List deploys for a project
deployRoutes.get('/projects/:name/deploys', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const name = c.req.param('name')

  const db = createDbClient(c.env.DB)

  // Get project
  const [project] = (await db`
    SELECT id, live_deploy_id FROM projects
    WHERE name = ${name}
      AND owner_id = ${auth.userId}
  `) as { id: string; live_deploy_id: string | null }[]

  if (!project) {
    return c.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' }, 404)
  }

  // Get deploys
  const deploys = (await db`
    SELECT id, version, file_count, total_bytes, created_at
    FROM deploys
    WHERE project_id = ${project.id}
    ORDER BY version DESC
  `) as DeployRow[]

  return c.json({
    deploys: deploys.map((d) => ({
      id: d.id,
      version: d.version,
      is_live: d.id === project.live_deploy_id,
      file_count: d.file_count,
      total_bytes: parseInt(d.total_bytes, 10),
      created_at: d.created_at,
    })),
  })
})
