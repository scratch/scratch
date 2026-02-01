import type { Env } from '../env'
import { createAuth, getSession } from '../auth'
import { buildProjectUrls } from '@scratch/shared/project'
import { parseGroup, validateGroupInput } from '@scratch/shared'
import { getOrCreateCloudflareAccessUser } from './cloudflare-access'
import { getContentDomain } from './domains'
import { visibilityExceedsMax } from './visibility'
import { createDbClient, type DbClient } from '../db/client'

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
// SQL Query Builders
// =============================================================================

/**
 * Build a SQL query for fetching project details with all related data.
 *
 * Returns a query that includes:
 * - All project fields (p.*)
 * - Owner email (from user table JOIN)
 * - Live version (from deploys table LEFT JOIN via live_deploy_id)
 * - Deploy count and last deploy timestamp (aggregated from all deploys)
 *
 * @param whereClause - SQL WHERE clause (without "WHERE" keyword), e.g., "p.owner_id = ?"
 * @param orderByClause - Optional SQL ORDER BY clause (without "ORDER BY" keyword)
 * @returns Complete SQL query string
 */
export function buildProjectDetailsQuery(whereClause: string, orderByClause?: string): string {
  const orderBy = orderByClause ? `\n    ORDER BY ${orderByClause}` : ''
  return `SELECT
      p.*,
      u.email as owner_email,
      d.version as live_version,
      CAST(COUNT(all_d.id) AS INTEGER) as deploy_count,
      MAX(all_d.created_at) as last_deploy_at
    FROM projects p
    JOIN "user" u ON p.owner_id = u.id
    LEFT JOIN deploys d ON p.live_deploy_id = d.id
    LEFT JOIN deploys all_d ON all_d.project_id = p.id
    WHERE ${whereClause}
    GROUP BY p.id, u.email, d.version${orderBy}`
}

// =============================================================================
// Project ownership helper
// =============================================================================

/**
 * Get a project owned by a specific user.
 * Returns the project ID if found and owned by the user, null otherwise.
 */
export async function getProjectForUser(
  db: DbClient,
  projectName: string,
  userId: string
): Promise<{ id: string } | null> {
  const [project] = (await db`
    SELECT id FROM projects
    WHERE name = ${projectName} AND owner_id = ${userId}
  `) as { id: string }[]

  return project ?? null
}

// =============================================================================
// Visibility validation helper
// =============================================================================

export type VisibilityValidationResult =
  | { valid: false; error: string; code: string }
  | { valid: true; value: string }

/**
 * Parse and validate a visibility string.
 *
 * This combines input validation, parsing, and MAX_VISIBILITY ceiling check
 * into a single helper to reduce duplication in API endpoints.
 *
 * @param raw - Raw visibility string from request (e.g., "public", "@domain.com", "user@email.com")
 * @param env - Environment with MAX_VISIBILITY setting
 * @returns Validation result with either error info or the normalized visibility value
 */
export function parseAndValidateVisibility(
  raw: string | undefined,
  env: Env
): VisibilityValidationResult {
  // If no visibility provided, it's valid (caller decides default)
  if (!raw) {
    return { valid: true, value: 'public' }
  }

  // Validate input format
  const inputError = validateGroupInput(raw)
  if (inputError) {
    return { valid: false, error: inputError, code: 'VISIBILITY_INVALID' }
  }

  // Parse into Group type
  const parsed = parseGroup(raw)

  // Check MAX_VISIBILITY ceiling
  if (visibilityExceedsMax(parsed, env)) {
    return {
      valid: false,
      error: 'Visibility cannot exceed server maximum',
      code: 'VISIBILITY_EXCEEDS_MAX',
    }
  }

  // Normalize to string for storage (arrays become comma-separated)
  const value = Array.isArray(parsed) ? parsed.join(',') : parsed

  return { valid: true, value }
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
