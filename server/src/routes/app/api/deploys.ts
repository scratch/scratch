import { Hono } from 'hono'
import type { Env } from '../../../env'
import { createDbClient } from '../../../db/client'
import { generateId } from '../../../lib/id'
import {
  validateProjectName,
  buildProjectUrls,
  getEmailLocalPart,
  isSingleDomainAllowedUsers,
} from '@scratch/shared/project'
import { parseGroup, validateGroupInput, deployCreateQuerySchema } from '@scratch/shared'
import { normalizePath, isValidFilePath } from '../../../lib/files'
import { visibilityExceedsMax } from '../../../lib/visibility'
import { unzip } from 'unzipit'
import { getAuthenticatedUser, type DeployRow } from '../../../lib/api-helpers'
import { getContentDomain, getContentBaseUrl } from '../../../lib/domains'

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
  })
  if (!queryResult.success) {
    return c.json({ error: 'Invalid query parameters', code: 'INVALID_PARAMS' }, 400)
  }
  const { visibility: rawVisibility } = queryResult.data

  // Validate project name
  const nameValidation = validateProjectName(name)
  if (!nameValidation.valid) {
    return c.json({ error: nameValidation.error, code: 'PROJECT_NAME_INVALID' }, 400)
  }

  // Optional visibility for auto-created projects (defaults to 'public')
  let projectVisibility = 'public'
  if (rawVisibility) {
    const visError = validateGroupInput(rawVisibility)
    if (visError) {
      return c.json({ error: visError, code: 'VISIBILITY_INVALID' }, 400)
    }
    const parsed = parseGroup(rawVisibility)
    if (visibilityExceedsMax(parsed, c.env)) {
      return c.json(
        { error: 'Visibility cannot exceed server maximum', code: 'VISIBILITY_EXCEEDS_MAX' },
        400
      )
    }
    projectVisibility = Array.isArray(parsed) ? parsed.join(',') : parsed
  }

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

  // Step 1: Transaction for all DB operations (ensures atomic version assignment)
  // Returns discriminated union to avoid exception-based control flow
  // Note: D1's single-writer model serializes all writes, making explicit locking unnecessary
  type TxResult =
    | { ok: true; projectId: string; version: number; projectCreated: boolean }
    | { ok: false; reason: 'PROJECT_NOT_OWNER' }

  const txResult = await db.transaction(async (tx): Promise<TxResult> => {
    // Check if project exists (D1's single-writer model handles concurrency)
    const [existingProject] = (await tx`
      SELECT id, owner_id FROM projects
      WHERE name = ${name} AND owner_id = ${auth.userId}
    `) as { id: string; owner_id: string }[]

    let projId: string
    let created = false

    if (existingProject) {
      // Project exists - already owned by this user
      projId = existingProject.id

      // Update visibility if provided
      if (rawVisibility) {
        await tx`
          UPDATE projects
          SET visibility = ${projectVisibility}, updated_at = datetime('now')
          WHERE id = ${projId}
        `
      }
    } else {
      // Auto-create project with specified or default visibility
      projId = generateId()
      await tx`
        INSERT INTO projects (id, name, owner_id, visibility, created_at, updated_at)
        VALUES (${projId}, ${name}, ${auth.userId}, ${projectVisibility}, datetime('now'), datetime('now'))
      `
      created = true
    }

    // Get next version number
    const [versionRow] = (await tx`
      SELECT COALESCE(MAX(version), 0) + 1 as next_version
      FROM deploys WHERE project_id = ${projId}
    `) as { next_version: number }[]

    // Create deploy record (but don't set live_deploy_id yet!)
    await tx`
      INSERT INTO deploys (id, project_id, version, file_count, total_bytes, created_at)
      VALUES (${deployId}, ${projId}, ${versionRow.next_version}, ${files.length}, ${totalExtractedBytes}, datetime('now'))
    `

    return { ok: true, projectId: projId, version: versionRow.next_version, projectCreated: created }
  })

  // Handle ownership error from transaction
  if (!txResult.ok) {
    return c.json({ error: 'Project owned by different user', code: 'PROJECT_NOT_OWNER' }, 403)
  }

  const { projectId, version, projectCreated } = txResult

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
  })

  // Step 4: Invalidate cache for this project (best-effort, don't block response)
  c.executionCtx.waitUntil(
    (async () => {
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
    })()
  )

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
