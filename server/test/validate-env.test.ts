import { describe, test, expect } from 'bun:test'
import { validateEnvForAuthMode } from '../src/lib/validate-env'
import type { Env } from '../src/env'

// Helper to create a minimal valid env
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
    ALLOW_SHARE_TOKENS: 'true',
    MAX_DEPLOY_SIZE: '10',
    ...overrides,
  }
}

describe('validateEnvForAuthMode', () => {
  describe('BETTER_AUTH_SECRET (always required)', () => {
    test('throws when BETTER_AUTH_SECRET is missing', () => {
      const env = createEnv({ BETTER_AUTH_SECRET: '' })
      expect(() => validateEnvForAuthMode(env)).toThrow('BETTER_AUTH_SECRET is required')
    })

    test('throws when BETTER_AUTH_SECRET is underscore placeholder', () => {
      const env = createEnv({ BETTER_AUTH_SECRET: '_' })
      expect(() => validateEnvForAuthMode(env)).toThrow('BETTER_AUTH_SECRET is required')
    })
  })

  describe('local mode (default)', () => {
    test('passes with valid Google OAuth credentials', () => {
      const env = createEnv({
        AUTH_MODE: 'local',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      })
      expect(() => validateEnvForAuthMode(env)).not.toThrow()
    })

    test('throws when GOOGLE_CLIENT_ID is missing', () => {
      const env = createEnv({
        AUTH_MODE: 'local',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      })
      expect(() => validateEnvForAuthMode(env)).toThrow('GOOGLE_CLIENT_ID is required when AUTH_MODE=local')
    })

    test('throws when GOOGLE_CLIENT_ID is underscore placeholder', () => {
      const env = createEnv({
        AUTH_MODE: 'local',
        GOOGLE_CLIENT_ID: '_',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      })
      expect(() => validateEnvForAuthMode(env)).toThrow('GOOGLE_CLIENT_ID is required when AUTH_MODE=local')
    })

    test('throws when GOOGLE_CLIENT_SECRET is missing', () => {
      const env = createEnv({
        AUTH_MODE: 'local',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: '',
      })
      expect(() => validateEnvForAuthMode(env)).toThrow('GOOGLE_CLIENT_SECRET is required when AUTH_MODE=local')
    })

    test('throws when GOOGLE_CLIENT_SECRET is underscore placeholder', () => {
      const env = createEnv({
        AUTH_MODE: 'local',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: '_',
      })
      expect(() => validateEnvForAuthMode(env)).toThrow('GOOGLE_CLIENT_SECRET is required when AUTH_MODE=local')
    })

    test('does not require CLOUDFLARE_ACCESS_TEAM', () => {
      const env = createEnv({
        AUTH_MODE: 'local',
        CLOUDFLARE_ACCESS_TEAM: '_',
      })
      expect(() => validateEnvForAuthMode(env)).not.toThrow()
    })
  })

  describe('cloudflare-access mode', () => {
    test('passes with valid CLOUDFLARE_ACCESS_TEAM', () => {
      const env = createEnv({
        AUTH_MODE: 'cloudflare-access',
        CLOUDFLARE_ACCESS_TEAM: 'my-team',
        GOOGLE_CLIENT_ID: '_',
        GOOGLE_CLIENT_SECRET: '_',
      })
      expect(() => validateEnvForAuthMode(env)).not.toThrow()
    })

    test('throws when CLOUDFLARE_ACCESS_TEAM is missing', () => {
      const env = createEnv({
        AUTH_MODE: 'cloudflare-access',
        CLOUDFLARE_ACCESS_TEAM: '',
      })
      expect(() => validateEnvForAuthMode(env)).toThrow('CLOUDFLARE_ACCESS_TEAM is required when AUTH_MODE=cloudflare-access')
    })

    test('throws when CLOUDFLARE_ACCESS_TEAM is underscore placeholder', () => {
      const env = createEnv({
        AUTH_MODE: 'cloudflare-access',
        CLOUDFLARE_ACCESS_TEAM: '_',
      })
      expect(() => validateEnvForAuthMode(env)).toThrow('CLOUDFLARE_ACCESS_TEAM is required when AUTH_MODE=cloudflare-access')
    })

    test('does not require Google OAuth credentials', () => {
      const env = createEnv({
        AUTH_MODE: 'cloudflare-access',
        CLOUDFLARE_ACCESS_TEAM: 'my-team',
        GOOGLE_CLIENT_ID: '_',
        GOOGLE_CLIENT_SECRET: '_',
      })
      expect(() => validateEnvForAuthMode(env)).not.toThrow()
    })
  })

  describe('multiple errors', () => {
    test('reports all missing variables in one error', () => {
      const env = createEnv({
        BETTER_AUTH_SECRET: '',
        AUTH_MODE: 'local',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
      })
      expect(() => validateEnvForAuthMode(env)).toThrow(/BETTER_AUTH_SECRET.*GOOGLE_CLIENT_ID.*GOOGLE_CLIENT_SECRET/s)
    })
  })
})
