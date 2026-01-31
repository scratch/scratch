import type { Env } from '../env'
import { createAuth, getSession } from '../auth'
import { buildProjectUrls } from '@scratch/shared/project'
import { getOrCreateCloudflareAccessUser } from './cloudflare-access'
import { getContentDomain } from './domains'
import { createDbClient } from '../db/client'

// =============================================================================
// Types
// =============================================================================

export interface AuthResult {
  userId: string
  user: { id: string; email: string; name: string | null; image: string | null }
}

export interface ProjectRow {
  id: string
  name: string
  owner_id: string
  owner_email: string  // Must be joined from user table
  live_deploy_id: string | null
  visibility: string
  created_at: string
  updated_at: string
}

export interface DeployRow {
  id: string
  project_id: string
  version: number
  file_count: number
  total_bytes: string // bigint comes as string
  created_at: string
}

// =============================================================================
// Authentication helper
// =============================================================================

/**
 * Get authenticated user from request.
 *
 * Authentication methods (checked in order):
 * 1. Bearer token (CLI device flow) - manual session lookup
 * 2. X-Api-Key header (API tokens) - BetterAuth apiKey plugin
 * 3. Cloudflare Access JWT (if AUTH_MODE=cloudflare-access)
 * 4. Session cookies (browser)
 */
export async function getAuthenticatedUser(
  c: { env: Env; req: { raw: Request } }
): Promise<AuthResult | null> {
  // Check for Bearer token first (CLI authentication via device flow)
  // BetterAuth's getSession has known issues with bearer tokens, so we manually
  // look up the session from the database.
  // See: https://github.com/better-auth/better-auth/issues/3892
  const authHeader = c.req.raw.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7) // Remove "Bearer " prefix
    const db = createDbClient(c.env.DB)

    // Look up session and user in one query
    const [row] = await db`
      SELECT s.user_id, s.expires_at, u.email, u.name, u.image
      FROM session s
      JOIN "user" u ON s.user_id = u.id
      WHERE s.token = ${token} AND s.expires_at > datetime('now')
    ` as { user_id: string; expires_at: string; email: string; name: string | null; image: string | null }[]

    if (row) {
      return {
        userId: row.user_id,
        user: {
          id: row.user_id,
          email: row.email,
          name: row.name,
          image: row.image,
        },
      }
    }
  }

  // Check for API key (X-Api-Key header) - works in all auth modes
  // This uses BetterAuth's apiKey plugin which validates the key and returns a session
  const apiKey = c.req.raw.headers.get('X-Api-Key')
  if (apiKey) {
    const auth = createAuth(c.env)
    const session = await getSession(c.req.raw, auth)
    if (session?.user) {
      return {
        userId: session.user.id,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name ?? null,
          image: session.user.image ?? null,
        },
      }
    }
    // API key was provided but invalid - don't fall through to other auth methods
    return null
  }

  // Cloudflare Access mode: check CF Access headers for browser sessions
  if (c.env.AUTH_MODE === 'cloudflare-access') {
    const user = await getOrCreateCloudflareAccessUser(c.req.raw, c.env)
    if (!user) return null
    return { userId: user.id, user }
  }

  // Standard auth: session cookies (browser)
  const auth = createAuth(c.env)
  const session = await getSession(c.req.raw, auth)

  if (!session?.user) return null

  return {
    userId: session.user.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
  }
}

// =============================================================================
// Formatting helpers
// =============================================================================

export function formatProject(
  row: ProjectRow,
  env: Env,
  extra?: { live_version?: number | null; deploy_count?: number; last_deploy_at?: string | null }
) {
  const urls = buildProjectUrls({
    pagesDomain: getContentDomain(env),
    projectName: row.name,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    allowedUsers: env.ALLOWED_USERS || '',
  })

  return {
    id: row.id,
    name: row.name,
    owner_id: row.owner_id,
    live_version: extra?.live_version ?? null,
    deploy_count: extra?.deploy_count ?? 0,
    visibility: row.visibility,
    urls,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_deploy_at: extra?.last_deploy_at ?? null,
  }
}
