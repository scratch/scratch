// Session management helpers
import type { DbClient } from '../db/client'
import { generateId } from './id'

// Session expires in 30 days
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Create a session for a user and return the session token.
 * Used by device authorization flows (CLI login, device approval).
 *
 * @param db - Database client
 * @param userId - User ID to create session for
 * @param userAgent - Optional user agent string (defaults to 'scratch-cli')
 * @returns The session token (to be sent to the client)
 */
export async function createSessionForUser(
  db: DbClient,
  userId: string,
  userAgent?: string | null
): Promise<string> {
  const sessionId = generateId()
  const sessionToken = generateId()
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)

  await db`
    INSERT INTO session (id, user_id, token, expires_at, user_agent, created_at, updated_at)
    VALUES (
      ${sessionId},
      ${userId},
      ${sessionToken},
      ${expiresAt.toISOString()},
      ${userAgent ?? 'scratch-cli'},
      datetime('now'),
      datetime('now')
    )
  `

  return sessionToken
}
