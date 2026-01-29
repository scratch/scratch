import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  validateInstanceVars,
  isUnset,
  getInstanceVarsPath,
  parseVarsFile,
  writeVarsFile,
} from '../lib/config'

describe('isUnset', () => {
  test('returns true for undefined', () => {
    expect(isUnset(undefined)).toBe(true)
  })

  test('returns true for empty string', () => {
    expect(isUnset('')).toBe(true)
  })

  test('returns true for underscore placeholder', () => {
    expect(isUnset('_')).toBe(true)
  })

  test('returns false for actual value', () => {
    expect(isUnset('some-value')).toBe(false)
  })
})

describe('validateInstanceVars auth-mode-aware validation', () => {
  const testDir = join(tmpdir(), `ops-config-test-${Date.now()}`)
  const originalCwd = process.cwd()

  beforeEach(() => {
    mkdirSync(join(testDir, 'server'), { recursive: true })
    process.chdir(testDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  function writeTestVars(instance: string, vars: Record<string, string>) {
    const varsPath = getInstanceVarsPath(instance)
    const content = Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    writeFileSync(varsPath, content)
  }

  test('validates common vars required for both modes', () => {
    writeTestVars('test', {
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      APP_PORT: '8788',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      AUTH_MODE: 'local',
      // Missing BETTER_AUTH_SECRET
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('BETTER_AUTH_SECRET')
  })

  test('local mode requires Google OAuth vars', () => {
    writeTestVars('test', {
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      APP_PORT: '8788',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      AUTH_MODE: 'local',
      BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
      // Missing GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('GOOGLE_CLIENT_ID')
    expect(result.missing).toContain('GOOGLE_CLIENT_SECRET')
  })

  test('local mode treats underscore as unset for Google vars', () => {
    writeTestVars('test', {
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      APP_PORT: '8788',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      AUTH_MODE: 'local',
      BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
      GOOGLE_CLIENT_ID: '_',
      GOOGLE_CLIENT_SECRET: '_',
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(false)
    expect(result.empty).toContain('GOOGLE_CLIENT_ID')
    expect(result.empty).toContain('GOOGLE_CLIENT_SECRET')
  })

  test('cloudflare-access mode requires CLOUDFLARE_ACCESS_TEAM', () => {
    writeTestVars('test', {
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      APP_PORT: '8788',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      AUTH_MODE: 'cloudflare-access',
      BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
      // Missing CLOUDFLARE_ACCESS_TEAM
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('CLOUDFLARE_ACCESS_TEAM')
  })

  test('cloudflare-access mode does NOT require Google vars', () => {
    writeTestVars('test', {
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      APP_PORT: '8788',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      AUTH_MODE: 'cloudflare-access',
      BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
      CLOUDFLARE_ACCESS_TEAM: 'my-team',
      GOOGLE_CLIENT_ID: '_',
      GOOGLE_CLIENT_SECRET: '_',
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(true)
    expect(result.missing).toHaveLength(0)
    expect(result.empty).toHaveLength(0)
  })

  test('local mode does NOT require CLOUDFLARE_ACCESS_TEAM', () => {
    writeTestVars('test', {
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      APP_PORT: '8788',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      AUTH_MODE: 'local',
      BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      CLOUDFLARE_ACCESS_TEAM: '_',
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(true)
    expect(result.missing).toHaveLength(0)
    expect(result.empty).toHaveLength(0)
  })

  test('defaults to local mode when AUTH_MODE not specified', () => {
    writeTestVars('test', {
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      APP_PORT: '8788',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      // No AUTH_MODE - should default to local
      BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(true)
  })
})
