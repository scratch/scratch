import { describe, test, expect } from 'bun:test'
import type { Env } from '../src/env'
import { pagesRoutes } from '../src/routes/pages'

// Helper to create a minimal env
function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    FILES: {} as R2Bucket,
    DB: {} as D1Database,
    D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
    BASE_DOMAIN: 'example.com',
    APP_SUBDOMAIN: 'app',
    CONTENT_SUBDOMAIN: 'pages',
        WWW_PROJECT_ID: '_',
    BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
    AUTH_MODE: 'local',
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    CLOUDFLARE_ACCESS_TEAM: '_',
    ALLOWED_USERS: 'public',
    MAX_VISIBILITY: 'public',
    ALLOW_SHARE_TOKENS: 'true',
    MAX_DEPLOY_SIZE: '10',
    ...overrides,
  }
}

// Create a mock D1Database that tracks queries
function createMockDb(queryResults: Map<string, unknown[][]> = new Map()): D1Database {
  const callIndex: Record<string, number> = {}

  return {
    prepare: (sql: string) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim()
      if (!callIndex[normalizedSql]) {
        callIndex[normalizedSql] = 0
      }
      const results = queryResults.get(normalizedSql) ?? [[]]
      const resultIndex = Math.min(callIndex[normalizedSql], results.length - 1)
      callIndex[normalizedSql]++

      return {
        bind: (..._params: unknown[]) => ({
          all: <T>() =>
            Promise.resolve({
              results: results[resultIndex] as T[],
              success: true,
              meta: {},
            }),
          first: <T>() => Promise.resolve(results[resultIndex][0] as T | null),
          run: () => Promise.resolve({ success: true, meta: {} }),
        }),
        all: <T>() =>
          Promise.resolve({
            results: results[resultIndex] as T[],
            success: true,
            meta: {},
          }),
        first: <T>() => Promise.resolve(results[resultIndex][0] as T | null),
        run: () => Promise.resolve({ success: true, meta: {} }),
      }
    },
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
}

describe('pages routes - URL handling', () => {
  describe('mdx redirect (via middleware)', () => {
    test('redirects .mdx URLs to .md with 301 status', async () => {
      const env = createEnv()
      const req = new Request('https://pages.example.com/user/project/page.mdx')

      const res = await pagesRoutes.fetch(req, env)

      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('https://pages.example.com/user/project/page.md')
    })

    test('preserves query parameters during .mdx redirect', async () => {
      const env = createEnv()
      const req = new Request('https://pages.example.com/user/project/page.mdx?foo=bar')

      const res = await pagesRoutes.fetch(req, env)

      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('https://pages.example.com/user/project/page.md?foo=bar')
    })
  })

  describe('trailing slash redirect', () => {
    test('redirects /{owner}/{project} to /{owner}/{project}/ with 301 status', async () => {
      const env = createEnv()
      const req = new Request('https://pages.example.com/user123/my-project')

      const res = await pagesRoutes.fetch(req, env)

      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('https://pages.example.com/user123/my-project/')
    })

    test('preserves query params during trailing slash redirect', async () => {
      const env = createEnv()
      const req = new Request('https://pages.example.com/user123/my-project?token=abc')

      const res = await pagesRoutes.fetch(req, env)

      expect(res.status).toBe(301)
      expect(res.headers.get('Location')).toBe('https://pages.example.com/user123/my-project/?token=abc')
    })

    test('does not redirect paths with trailing slash', async () => {
      const env = createEnv({ DB: createMockDb() })
      const req = new Request('https://pages.example.com/user123/my-project/')

      const res = await pagesRoutes.fetch(req, env)

      // Should not be 301 redirect
      expect(res.status).not.toBe(301)
    })

    test('does not redirect paths with file segments', async () => {
      const env = createEnv({ DB: createMockDb() })
      const req = new Request('https://pages.example.com/user123/my-project/index.html')

      const res = await pagesRoutes.fetch(req, env)

      // Should not be 301 redirect for trailing slash
      expect(res.status).not.toBe(301)
    })
  })

  describe('path parsing', () => {
    test('returns 404 for root path', async () => {
      const env = createEnv()
      const req = new Request('https://pages.example.com/')

      const res = await pagesRoutes.fetch(req, env)

      expect(res.status).toBe(404)
      expect(await res.text()).toBe('Not Found')
    })

    test('returns 404 for single-segment path (no project name)', async () => {
      const env = createEnv()
      const req = new Request('https://pages.example.com/user123/')

      const res = await pagesRoutes.fetch(req, env)

      expect(res.status).toBe(404)
      expect(await res.text()).toBe('Not Found')
    })
  })
})

describe('pages routes - owner resolution', () => {
  // Tests for owner resolution verify that the inlined resolveOwnerId logic works correctly
  // We test by verifying that non-existent owners result in auth redirect

  test('does not try local-part resolution when ALLOWED_USERS is not a single domain', async () => {
    const localPart = 'john'
    const queryResults = new Map<string, unknown[][]>([
      // First query: not found by ID
      ['SELECT id FROM "user" WHERE id = ?', [[]]],
      // Second query: not found by email
      ['SELECT id FROM "user" WHERE lower(email) = ?', [[]]],
      // No third query since ALLOWED_USERS is 'public', not a single domain
    ])

    const env = createEnv({
      ALLOWED_USERS: 'public',
      DB: createMockDb(queryResults),
    })
    const req = new Request(`https://pages.example.com/${localPart}/my-project/`)
    const res = await pagesRoutes.fetch(req, env)

    // Owner not found - should redirect to auth with synthetic ID
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('/auth/content-access')
  })
})

describe('pages routes - non-existent project handling (security)', () => {
  // These tests verify the security property that attackers cannot distinguish
  // "project doesn't exist" from "project is private" - both result in auth redirect

  test('redirects to auth with synthetic ID when owner not found', async () => {
    const queryResults = new Map<string, unknown[][]>([
      // Not found by ID
      ['SELECT id FROM "user" WHERE id = ?', [[]]],
      // Not found by email
      ['SELECT id FROM "user" WHERE lower(email) = ?', [[]]],
    ])

    const env = createEnv({
      ALLOWED_USERS: 'public',
      DB: createMockDb(queryResults),
    })
    const req = new Request('https://pages.example.com/unknown-user/secret-project/')
    const res = await pagesRoutes.fetch(req, env)

    // Should redirect to auth - this prevents distinguishing non-existent from private
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    expect(location).toContain('/auth/content-access')
    expect(location).toContain('project_id=')
  })

  test('redirects to auth when owner exists but project does not', async () => {
    const userId = 'user-id-123'
    const queryResults = new Map<string, unknown[][]>([
      // Found by ID
      ['SELECT id FROM "user" WHERE id = ?', [[{ id: userId }]]],
      // Project not found
      [
        'SELECT p.id, p.name, p.owner_id, u.email as owner_email, p.visibility, p.live_deploy_id FROM projects p JOIN "user" u ON p.owner_id = u.id WHERE p.name = ? AND p.owner_id = ?',
        [[]],
      ],
    ])

    const env = createEnv({ DB: createMockDb(queryResults) })
    const req = new Request('https://pages.example.com/user-id-123/nonexistent-project/')
    const res = await pagesRoutes.fetch(req, env)

    // Should redirect to auth - same behavior as non-existent owner
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('/auth/content-access')
  })

  test('generates deterministic synthetic ID for same path', async () => {
    const queryResults = new Map<string, unknown[][]>([
      ['SELECT id FROM "user" WHERE id = ?', [[]]],
      ['SELECT id FROM "user" WHERE lower(email) = ?', [[]]],
    ])

    const env = createEnv({
      ALLOWED_USERS: 'public',
      DB: createMockDb(queryResults),
    })

    const req1 = new Request('https://pages.example.com/test-user/test-project/')
    const res1 = await pagesRoutes.fetch(req1, env)
    const location1 = res1.headers.get('Location')!
    const syntheticId1 = new URL(location1).searchParams.get('project_id')

    const req2 = new Request('https://pages.example.com/test-user/test-project/')
    const res2 = await pagesRoutes.fetch(req2, env)
    const location2 = res2.headers.get('Location')!
    const syntheticId2 = new URL(location2).searchParams.get('project_id')

    // Same path should produce same synthetic ID (deterministic hash)
    expect(syntheticId1).toBe(syntheticId2)
    expect(syntheticId1).toBeTruthy()
  })

  test('generates different synthetic IDs for different paths', async () => {
    const queryResults = new Map<string, unknown[][]>([
      ['SELECT id FROM "user" WHERE id = ?', [[]]],
      ['SELECT id FROM "user" WHERE lower(email) = ?', [[]]],
    ])

    const env = createEnv({
      ALLOWED_USERS: 'public',
      DB: createMockDb(queryResults),
    })

    const req1 = new Request('https://pages.example.com/user1/project1/')
    const res1 = await pagesRoutes.fetch(req1, env)
    const location1 = res1.headers.get('Location')!
    const syntheticId1 = new URL(location1).searchParams.get('project_id')

    const req2 = new Request('https://pages.example.com/user2/project2/')
    const res2 = await pagesRoutes.fetch(req2, env)
    const location2 = res2.headers.get('Location')!
    const syntheticId2 = new URL(location2).searchParams.get('project_id')

    // Different paths should produce different synthetic IDs
    expect(syntheticId1).not.toBe(syntheticId2)
  })

  test('synthetic ID matches nanoid format (21 chars)', async () => {
    const queryResults = new Map<string, unknown[][]>([
      ['SELECT id FROM "user" WHERE id = ?', [[]]],
      ['SELECT id FROM "user" WHERE lower(email) = ?', [[]]],
    ])

    const env = createEnv({
      ALLOWED_USERS: 'public',
      DB: createMockDb(queryResults),
    })

    const req = new Request('https://pages.example.com/test-user/test-project/')
    const res = await pagesRoutes.fetch(req, env)
    const location = res.headers.get('Location')!
    const syntheticId = new URL(location).searchParams.get('project_id')

    expect(syntheticId!.length).toBe(21)
  })
})
