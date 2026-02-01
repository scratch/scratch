import { describe, test, expect } from 'bun:test'
import {
  isLocalhost,
  getContentDomain,
  getAppBaseUrl,
  getContentBaseUrl,
  useHttps,
  isWwwOrRootDomain,
} from '../src/lib/domains'
import type { Env } from '../src/env'

// Helper to create a minimal env for domain tests
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

describe('isLocalhost', () => {
  test('returns true for "localhost"', () => {
    const env = createEnv({ BASE_DOMAIN: 'localhost' })
    expect(isLocalhost(env)).toBe(true)
  })

  test('returns true for "localhost:8787"', () => {
    const env = createEnv({ BASE_DOMAIN: 'localhost:8787' })
    expect(isLocalhost(env)).toBe(true)
  })

  test('returns false for production domain', () => {
    const env = createEnv({ BASE_DOMAIN: 'example.com' })
    expect(isLocalhost(env)).toBe(false)
  })

  test('returns false for staging domain', () => {
    const env = createEnv({ BASE_DOMAIN: 'staging.example.com' })
    expect(isLocalhost(env)).toBe(false)
  })
})

describe('getContentDomain', () => {
  test('returns subdomain.base_domain for production', () => {
    const env = createEnv({
      BASE_DOMAIN: 'example.com',
      CONTENT_SUBDOMAIN: 'pages',
    })
    expect(getContentDomain(env)).toBe('pages.example.com')
  })

  test('returns subdomain.localhost:port for local dev', () => {
    const env = createEnv({
      BASE_DOMAIN: 'localhost:8787',
      CONTENT_SUBDOMAIN: 'pages',
    })
    expect(getContentDomain(env)).toBe('pages.localhost:8787')
  })

  test('uses custom content subdomain', () => {
    const env = createEnv({
      BASE_DOMAIN: 'scratch.dev',
      CONTENT_SUBDOMAIN: 'cdn',
    })
    expect(getContentDomain(env)).toBe('cdn.scratch.dev')
  })
})

describe('getAppBaseUrl', () => {
  test('returns https URL for production', () => {
    const env = createEnv({
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
    })
    expect(getAppBaseUrl(env)).toBe('https://app.example.com')
  })

  test('returns http URL for localhost', () => {
    const env = createEnv({
      BASE_DOMAIN: 'localhost:8788',
      APP_SUBDOMAIN: 'app',
    })
    expect(getAppBaseUrl(env)).toBe('http://app.localhost:8788')
  })

  test('uses custom app subdomain', () => {
    const env = createEnv({
      BASE_DOMAIN: 'scratch.dev',
      APP_SUBDOMAIN: 'api',
    })
    expect(getAppBaseUrl(env)).toBe('https://api.scratch.dev')
  })
})

describe('getContentBaseUrl', () => {
  test('returns https URL for production', () => {
    const env = createEnv({
      BASE_DOMAIN: 'example.com',
      CONTENT_SUBDOMAIN: 'pages',
    })
    expect(getContentBaseUrl(env)).toBe('https://pages.example.com')
  })

  test('returns http URL for localhost', () => {
    const env = createEnv({
      BASE_DOMAIN: 'localhost:8787',
      CONTENT_SUBDOMAIN: 'pages',
    })
    expect(getContentBaseUrl(env)).toBe('http://pages.localhost:8787')
  })

  test('uses custom content subdomain', () => {
    const env = createEnv({
      BASE_DOMAIN: 'scratch.dev',
      CONTENT_SUBDOMAIN: 'cdn',
    })
    expect(getContentBaseUrl(env)).toBe('https://cdn.scratch.dev')
  })
})

describe('useHttps', () => {
  test('returns true for production domain', () => {
    const env = createEnv({ BASE_DOMAIN: 'example.com' })
    expect(useHttps(env)).toBe(true)
  })

  test('returns false for localhost', () => {
    const env = createEnv({ BASE_DOMAIN: 'localhost' })
    expect(useHttps(env)).toBe(false)
  })

  test('returns false for localhost with port', () => {
    const env = createEnv({ BASE_DOMAIN: 'localhost:8787' })
    expect(useHttps(env)).toBe(false)
  })
})

describe('isWwwOrRootDomain', () => {
  test('returns true for www.example.com', () => {
    const env = createEnv({ BASE_DOMAIN: 'example.com' })
    expect(isWwwOrRootDomain('www.example.com', env)).toBe(true)
  })

  test('returns true for example.com (root domain)', () => {
    const env = createEnv({ BASE_DOMAIN: 'example.com' })
    expect(isWwwOrRootDomain('example.com', env)).toBe(true)
  })

  test('returns false for app.example.com', () => {
    const env = createEnv({ BASE_DOMAIN: 'example.com' })
    expect(isWwwOrRootDomain('app.example.com', env)).toBe(false)
  })

  test('returns false for pages.example.com', () => {
    const env = createEnv({ BASE_DOMAIN: 'example.com' })
    expect(isWwwOrRootDomain('pages.example.com', env)).toBe(false)
  })

  test('is case-insensitive for host', () => {
    const env = createEnv({ BASE_DOMAIN: 'example.com' })
    expect(isWwwOrRootDomain('WWW.EXAMPLE.COM', env)).toBe(true)
    expect(isWwwOrRootDomain('Example.Com', env)).toBe(true)
  })

  test('is case-insensitive for base domain', () => {
    const env = createEnv({ BASE_DOMAIN: 'Example.Com' })
    expect(isWwwOrRootDomain('www.example.com', env)).toBe(true)
    expect(isWwwOrRootDomain('example.com', env)).toBe(true)
  })

  test('works with custom domain', () => {
    const env = createEnv({ BASE_DOMAIN: 'scratch.dev' })
    expect(isWwwOrRootDomain('www.scratch.dev', env)).toBe(true)
    expect(isWwwOrRootDomain('scratch.dev', env)).toBe(true)
    expect(isWwwOrRootDomain('app.scratch.dev', env)).toBe(false)
  })
})
