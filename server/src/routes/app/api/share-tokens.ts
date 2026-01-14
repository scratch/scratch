import { Hono } from 'hono'
import type { Env } from '../../../env'
import { createDbClient } from '../../../db/client'
import { generateId } from '../../../lib/id'
import { buildProjectUrls } from '@scratch/shared/project'
import { getAuthenticatedUser } from '../../../lib/api-helpers'
import {
  shareTokenCreateRequestSchema,
  type ShareToken,
  type ShareTokenDuration,
} from '@scratch/shared/api'
import {
  isShareTokensEnabled,
  sanitizeTokenName,
  calculateExpiry,
  generateShareToken,
} from '../../../lib/share-tokens'
import { ErrorCodes } from '@scratch/shared/api'
import { getContentDomain } from '../../../lib/domains'

export const shareTokenRoutes = new Hono<{ Bindings: Env }>({ strict: true })

const MAX_ACTIVE_TOKENS_PER_PROJECT = 10

// Helper to format a share token row for API response
function formatShareToken(row: {
  id: string
  project_id: string
  name: string
  duration: string
  expires_at: string
  revoked_at: string | null
  created_at: string
}): ShareToken {
  const now = new Date()
  const expiresAt = new Date(row.expires_at)
  const isExpired = expiresAt < now
  const isRevoked = row.revoked_at !== null

  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    duration: row.duration as ShareTokenDuration,
    expires_at: row.expires_at,
    is_active: !isExpired && !isRevoked,
    is_expired: isExpired,
    is_revoked: isRevoked,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  }
}

// POST /api/projects/:name/share-tokens - Create a share token
shareTokenRoutes.post('/projects/:name/share-tokens', async (c) => {
  // Check feature flag
  if (!isShareTokensEnabled(c.env)) {
    return c.json(
      { error: 'Share tokens are disabled on this server', code: ErrorCodes.SHARE_TOKENS_DISABLED },
      403
    )
  }

  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const projectName = c.req.param('name')

  // Parse and validate request body
  let body: { name?: string; duration?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body', code: ErrorCodes.INVALID_REQUEST }, 400)
  }

  const parseResult = shareTokenCreateRequestSchema.safeParse(body)
  if (!parseResult.success) {
    const firstError = parseResult.error.errors[0]
    if (firstError?.path[0] === 'duration') {
      return c.json(
        { error: 'Duration must be 1d, 1w, or 1m', code: ErrorCodes.SHARE_TOKEN_DURATION_INVALID },
        400
      )
    }
    return c.json(
      { error: 'Name is required (1-100 characters)', code: ErrorCodes.SHARE_TOKEN_NAME_INVALID },
      400
    )
  }

  const { duration } = parseResult.data
  const sanitizedName = sanitizeTokenName(parseResult.data.name)

  if (sanitizedName.length < 1) {
    return c.json(
      {
        error: 'Name must contain at least one alphanumeric character',
        code: ErrorCodes.SHARE_TOKEN_NAME_INVALID,
      },
      400
    )
  }

  const db = createDbClient(c.env.DB)

  // Verify project ownership
  const [project] = (await db`
    SELECT id FROM projects
    WHERE name = ${projectName} AND owner_id = ${auth.userId}
  `) as { id: string }[]

  if (!project) {
    return c.json({ error: 'Project not found', code: ErrorCodes.PROJECT_NOT_FOUND }, 404)
  }

  // Check active token limit
  const [countResult] = (await db`
    SELECT CAST(COUNT(*) AS INTEGER) as count FROM share_tokens
    WHERE project_id = ${project.id}
      AND revoked_at IS NULL
      AND expires_at > datetime('now')
  `) as { count: number }[]

  if (countResult!.count >= MAX_ACTIVE_TOKENS_PER_PROJECT) {
    return c.json(
      {
        error: `Maximum ${MAX_ACTIVE_TOKENS_PER_PROJECT} active share tokens per project`,
        code: ErrorCodes.SHARE_TOKEN_LIMIT_EXCEEDED,
      },
      400
    )
  }

  // Generate token
  const tokenId = generateId()
  const expiresAt = calculateExpiry(duration)
  const token = generateShareToken()

  // Insert into database
  const [inserted] = (await db`
    INSERT INTO share_tokens (id, project_id, owner_id, token, name, duration, expires_at, created_at)
    VALUES (${tokenId}, ${project.id}, ${auth.userId}, ${token}, ${sanitizedName}, ${duration}, ${expiresAt.toISOString()}, datetime('now'))
    RETURNING id, project_id, name, duration, expires_at, revoked_at, created_at
  `) as {
    id: string
    project_id: string
    name: string
    duration: string
    expires_at: string
    revoked_at: string | null
    created_at: string
  }[]

  // Build share URL using primary URL
  const urls = buildProjectUrls({
    pagesDomain: getContentDomain(c.env),
    projectName,
    ownerId: auth.userId,
    ownerEmail: auth.user.email,
    allowedUsers: c.env.ALLOWED_USERS || '',
  })
  const shareUrl = `${urls.primary}?token=${encodeURIComponent(token)}`

  return c.json(
    {
      share_token: formatShareToken(inserted!),
      token,
      share_url: shareUrl,
    },
    201
  )
})

// GET /api/projects/:name/share-tokens - List all share tokens for a project
shareTokenRoutes.get('/projects/:name/share-tokens', async (c) => {
  // Check feature flag
  if (!isShareTokensEnabled(c.env)) {
    return c.json(
      { error: 'Share tokens are disabled on this server', code: ErrorCodes.SHARE_TOKENS_DISABLED },
      403
    )
  }

  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const projectName = c.req.param('name')

  const db = createDbClient(c.env.DB)

  // Verify project ownership
  const [project] = (await db`
    SELECT id FROM projects
    WHERE name = ${projectName} AND owner_id = ${auth.userId}
  `) as { id: string }[]

  if (!project) {
    return c.json({ error: 'Project not found', code: ErrorCodes.PROJECT_NOT_FOUND }, 404)
  }

  // Fetch all tokens (including expired/revoked for audit)
  const tokens = (await db`
    SELECT id, project_id, name, duration, expires_at, revoked_at, created_at
    FROM share_tokens
    WHERE project_id = ${project.id}
    ORDER BY created_at DESC
  `) as {
    id: string
    project_id: string
    name: string
    duration: string
    expires_at: string
    revoked_at: string | null
    created_at: string
  }[]

  return c.json({
    share_tokens: tokens.map(formatShareToken),
  })
})

// DELETE /api/projects/:name/share-tokens/:tokenId - Revoke a share token
shareTokenRoutes.delete('/projects/:name/share-tokens/:tokenId', async (c) => {
  // Check feature flag
  if (!isShareTokensEnabled(c.env)) {
    return c.json(
      { error: 'Share tokens are disabled on this server', code: ErrorCodes.SHARE_TOKENS_DISABLED },
      403
    )
  }

  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const projectName = c.req.param('name')
  const tokenId = c.req.param('tokenId')

  const db = createDbClient(c.env.DB)

  // Verify ownership and get token
  const [token] = (await db`
    SELECT st.id, st.project_id, st.name, st.duration, st.expires_at, st.revoked_at, st.created_at
    FROM share_tokens st
    JOIN projects p ON st.project_id = p.id
    WHERE st.id = ${tokenId}
      AND p.name = ${projectName}
      AND p.owner_id = ${auth.userId}
  `) as {
    id: string
    project_id: string
    name: string
    duration: string
    expires_at: string
    revoked_at: string | null
    created_at: string
  }[]

  if (!token) {
    return c.json({ error: 'Share token not found', code: ErrorCodes.SHARE_TOKEN_NOT_FOUND }, 404)
  }

  if (token.revoked_at) {
    return c.json(
      { error: 'Share token already revoked', code: ErrorCodes.SHARE_TOKEN_ALREADY_REVOKED },
      400
    )
  }

  // Revoke the token
  const [updated] = (await db`
    UPDATE share_tokens
    SET revoked_at = datetime('now')
    WHERE id = ${tokenId}
    RETURNING id, project_id, name, duration, expires_at, revoked_at, created_at
  `) as {
    id: string
    project_id: string
    name: string
    duration: string
    expires_at: string
    revoked_at: string | null
    created_at: string
  }[]

  return c.json({
    share_token: formatShareToken(updated!),
  })
})
