// Share token generation and validation for anonymous project access
// Tokens grant time-limited access to a specific project without authentication

import type { Env } from '../env'
import type { DbClient } from '../db/client'
import { SHARE_TOKEN_DURATION_SECONDS, type ShareTokenDuration } from '@scratch/shared/api'

// Token prefix for identification
const TOKEN_PREFIX = 'shr_'

/**
 * Check if share tokens feature is enabled
 */
export function isShareTokensEnabled(env: Env): boolean {
  return env.ALLOW_SHARE_TOKENS === 'true'
}

/**
 * Sanitize a token name: lowercase, strip special chars, spaces to hyphens
 */
export function sanitizeTokenName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
    .slice(0, 64)                  // Max length
}

/**
 * Calculate expiry date from duration
 */
export function calculateExpiry(duration: ShareTokenDuration): Date {
  const seconds = SHARE_TOKEN_DURATION_SECONDS[duration]
  return new Date(Date.now() + seconds * 1000)
}

/**
 * Generate an opaque share token (16 bytes of randomness, base64url encoded)
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // Convert to base64url
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64url = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return TOKEN_PREFIX + base64url
}

/**
 * Validate a share token against the database
 * Returns project info if valid, null if invalid/expired/revoked
 */
export async function validateShareToken(
  db: DbClient,
  token: string
): Promise<{ projectId: string; namespace: string } | null> {
  // Quick format check
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null
  }

  const result = await db`
    SELECT st.project_id, p.namespace
    FROM share_tokens st
    JOIN projects p ON st.project_id = p.id
    WHERE st.token = ${token}
      AND st.revoked_at IS NULL
      AND st.expires_at > datetime('now')
  ` as { project_id: string; namespace: string }[]

  if (result.length === 0) {
    return null
  }

  return {
    projectId: result[0].project_id,
    namespace: result[0].namespace,
  }
}
