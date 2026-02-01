import { describe, test, expect } from 'bun:test'
import { shareTokenRoutes } from '../src/routes/app/api/share-tokens'
import type { Env } from '../src/env'

// Helper to create a minimal env with share tokens disabled
function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    FILES: {} as R2Bucket,
    DB: {} as D1Database,
    D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
    BASE_DOMAIN: 'example.com',
    APP_SUBDOMAIN: 'app',
    CONTENT_SUBDOMAIN: 'pages',
    CLOUDFLARE_ZONE: 'example.com',
    WWW_PROJECT_ID: '_',
    BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
    AUTH_MODE: 'local',
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    CLOUDFLARE_ACCESS_TEAM: '_',
    ALLOWED_USERS: 'public',
    MAX_VISIBILITY: 'public',
    ALLOW_SHARE_TOKENS: 'false',
    MAX_DEPLOY_SIZE: '10',
    ...overrides,
  }
}

describe('share-tokens middleware', () => {
  describe('feature flag disabled', () => {
    test('POST /projects/:name/share-tokens returns 403 when share tokens disabled', async () => {
      const env = createEnv({ ALLOW_SHARE_TOKENS: 'false' })
      const req = new Request('http://localhost/projects/test-project/share-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-token', duration: '1d' }),
      })

      const res = await shareTokenRoutes.fetch(req, env)
      expect(res.status).toBe(403)

      const body = await res.json() as { error: string; code: string }
      expect(body.error).toBe('Share tokens are disabled on this server')
      expect(body.code).toBe('SHARE_TOKENS_DISABLED')
    })

    test('GET /projects/:name/share-tokens returns 403 when share tokens disabled', async () => {
      const env = createEnv({ ALLOW_SHARE_TOKENS: 'false' })
      const req = new Request('http://localhost/projects/test-project/share-tokens', {
        method: 'GET',
      })

      const res = await shareTokenRoutes.fetch(req, env)
      expect(res.status).toBe(403)

      const body = await res.json() as { error: string; code: string }
      expect(body.error).toBe('Share tokens are disabled on this server')
      expect(body.code).toBe('SHARE_TOKENS_DISABLED')
    })

    test('DELETE /projects/:name/share-tokens/:tokenId returns 403 when share tokens disabled', async () => {
      const env = createEnv({ ALLOW_SHARE_TOKENS: 'false' })
      const req = new Request('http://localhost/projects/test-project/share-tokens/token-123', {
        method: 'DELETE',
      })

      const res = await shareTokenRoutes.fetch(req, env)
      expect(res.status).toBe(403)

      const body = await res.json() as { error: string; code: string }
      expect(body.error).toBe('Share tokens are disabled on this server')
      expect(body.code).toBe('SHARE_TOKENS_DISABLED')
    })
  })

  describe('feature flag enabled', () => {
    test('POST /projects/:name/share-tokens passes middleware when share tokens enabled', async () => {
      const env = createEnv({ ALLOW_SHARE_TOKENS: 'true' })
      const req = new Request('http://localhost/projects/test-project/share-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-token', duration: '1d' }),
      })

      const res = await shareTokenRoutes.fetch(req, env)
      // Should not be 403 (middleware passed), but 401 (no auth) or other status
      expect(res.status).not.toBe(403)
    })

    test('GET /projects/:name/share-tokens passes middleware when share tokens enabled', async () => {
      const env = createEnv({ ALLOW_SHARE_TOKENS: 'true' })
      const req = new Request('http://localhost/projects/test-project/share-tokens', {
        method: 'GET',
      })

      const res = await shareTokenRoutes.fetch(req, env)
      // Should not be 403 (middleware passed), but 401 (no auth) or other status
      expect(res.status).not.toBe(403)
    })

    test('DELETE /projects/:name/share-tokens/:tokenId passes middleware when share tokens enabled', async () => {
      const env = createEnv({ ALLOW_SHARE_TOKENS: 'true' })
      const req = new Request('http://localhost/projects/test-project/share-tokens/token-123', {
        method: 'DELETE',
      })

      const res = await shareTokenRoutes.fetch(req, env)
      // Should not be 403 (middleware passed), but 401 (no auth) or other status
      expect(res.status).not.toBe(403)
    })
  })
})
