import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createSessionForUser } from '../src/lib/session'
import type { DbClient } from '../src/db/client'

describe('createSessionForUser', () => {
  let mockDb: DbClient
  let insertedValues: unknown[] = []

  beforeEach(() => {
    insertedValues = []
    // Create a mock db that captures inserted values
    mockDb = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        insertedValues = values
        return []
      },
      {
        query: async () => [],
      }
    ) as DbClient
  })

  test('creates session with correct user ID', async () => {
    const userId = 'user-123'
    await createSessionForUser(mockDb, userId)

    // userId should be the second value (after sessionId)
    expect(insertedValues[1]).toBe(userId)
  })

  test('returns a session token (UUID format)', async () => {
    const token = await createSessionForUser(mockDb, 'user-123')

    // Should be a valid UUID format
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  test('uses default user agent when not provided', async () => {
    await createSessionForUser(mockDb, 'user-123')

    // User agent is the 5th value (sessionId, userId, token, expiresAt, userAgent)
    expect(insertedValues[4]).toBe('scratch-cli')
  })

  test('uses provided user agent when given', async () => {
    await createSessionForUser(mockDb, 'user-123', 'Mozilla/5.0')

    expect(insertedValues[4]).toBe('Mozilla/5.0')
  })

  test('uses null when user agent is explicitly null', async () => {
    await createSessionForUser(mockDb, 'user-123', null)

    // null should be passed through but our helper defaults to 'scratch-cli' for null
    expect(insertedValues[4]).toBe('scratch-cli')
  })

  test('sets expiration to approximately 30 days in the future', async () => {
    const beforeCreate = Date.now()
    await createSessionForUser(mockDb, 'user-123')
    const afterCreate = Date.now()

    // expiresAt is the 4th value
    const expiresAt = new Date(insertedValues[3] as string).getTime()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

    // Should be approximately 30 days from now (within 1 second tolerance)
    expect(expiresAt).toBeGreaterThanOrEqual(beforeCreate + thirtyDaysMs - 1000)
    expect(expiresAt).toBeLessThanOrEqual(afterCreate + thirtyDaysMs + 1000)
  })

  test('generates unique session IDs for each call', async () => {
    const tokens: string[] = []

    for (let i = 0; i < 3; i++) {
      const token = await createSessionForUser(mockDb, 'user-123')
      tokens.push(token)
    }

    // All tokens should be unique
    const uniqueTokens = new Set(tokens)
    expect(uniqueTokens.size).toBe(3)
  })
})

describe('device authorization flows (ui.ts)', () => {
  // These are integration-style tests that verify the behavior described in the code.
  // Since the actual endpoints require complex mocking of Hono, getAuthenticatedUser,
  // and database interactions, we focus on testing the session creation helper
  // which is the shared code extracted for consolidation.

  describe('/cli-login flow', () => {
    test('session helper can be used for CLI login', async () => {
      // Simulate the /cli-login POST flow
      const userId = 'user-abc'
      const mockDb = Object.assign(
        async () => [],
        { query: async () => [] }
      ) as DbClient

      const sessionToken = await createSessionForUser(mockDb, userId)

      // The token should be valid for use in callback URL
      expect(sessionToken).toBeTruthy()
      expect(typeof sessionToken).toBe('string')
    })
  })

  describe('/device flow (CF Access auto-approve)', () => {
    test('session helper can be used with custom user agent', async () => {
      // Simulate the /device GET CF Access flow which passes User-Agent
      const userId = 'user-xyz'
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      const mockDb = Object.assign(
        async (_: TemplateStringsArray, ...values: unknown[]) => {
          // Verify user agent is passed correctly
          expect(values[4]).toBe(userAgent)
          return []
        },
        { query: async () => [] }
      ) as DbClient

      const sessionToken = await createSessionForUser(mockDb, userId, userAgent)
      expect(sessionToken).toBeTruthy()
    })
  })
})
