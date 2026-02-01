import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  validateInstanceVars,
  isUnset,
  getInstanceVarsPath,
  getInstanceWranglerPath,
  getWranglerConfigPath,
  getWranglerConfigArg,
  parseVarsFile,
  writeVarsFile,
  COMMON_AUTH_VARS,
  LOCAL_AUTH_VARS,
  CF_ACCESS_AUTH_VARS,
} from '../lib/config'

describe('wrangler config path functions', () => {
  test('getInstanceWranglerPath returns full path for file operations', () => {
    expect(getInstanceWranglerPath('staging')).toBe('server/wrangler.staging.toml')
    expect(getInstanceWranglerPath('prod')).toBe('server/wrangler.prod.toml')
    expect(getInstanceWranglerPath('dev')).toBe('server/wrangler.dev.toml')
  })

  test('getWranglerConfigPath is an alias for getInstanceWranglerPath', () => {
    expect(getWranglerConfigPath('staging')).toBe(getInstanceWranglerPath('staging'))
    expect(getWranglerConfigPath('prod')).toBe(getInstanceWranglerPath('prod'))
    expect(getWranglerConfigPath('dev')).toBe(getInstanceWranglerPath('dev'))
  })

  test('getWranglerConfigArg returns path relative to server/ for CLI usage', () => {
    expect(getWranglerConfigArg('staging')).toBe('wrangler.staging.toml')
    expect(getWranglerConfigArg('prod')).toBe('wrangler.prod.toml')
    expect(getWranglerConfigArg('dev')).toBe('wrangler.dev.toml')
  })

  test('getWranglerConfigArg is consistent with getInstanceWranglerPath', () => {
    // The CLI arg should be the full path without the 'server/' prefix
    const instances = ['staging', 'prod', 'dev', 'test', 'local']
    for (const instance of instances) {
      const fullPath = getInstanceWranglerPath(instance)
      const cliArg = getWranglerConfigArg(instance)
      expect(fullPath).toBe(`server/${cliArg}`)
    }
  })

  test('handles instance names with special characters', () => {
    // Instance names with hyphens
    expect(getWranglerConfigArg('my-instance')).toBe('wrangler.my-instance.toml')
    expect(getInstanceWranglerPath('my-instance')).toBe('server/wrangler.my-instance.toml')

    // Instance names with numbers
    expect(getWranglerConfigArg('staging2')).toBe('wrangler.staging2.toml')
    expect(getInstanceWranglerPath('staging2')).toBe('server/wrangler.staging2.toml')
  })
})

describe('writeVarsFile', () => {
  const testDir = join(tmpdir(), `ops-writeVarsFile-test-${Date.now()}`)

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  test('creates a file with correct format', () => {
    const testPath = join(testDir, 'test.vars')
    const vars = new Map<string, string>([
      ['FOO', 'bar'],
      ['BAZ', 'qux'],
      ['HELLO', 'world'],
    ])

    writeVarsFile(testPath, vars)

    const content = readFileSync(testPath, 'utf-8')
    expect(content).toBe('FOO=bar\nBAZ=qux\nHELLO=world\n')
  })

  test('handles empty maps', () => {
    const testPath = join(testDir, 'empty.vars')
    const vars = new Map<string, string>()

    writeVarsFile(testPath, vars)

    const content = readFileSync(testPath, 'utf-8')
    expect(content).toBe('\n')
  })

  test('handles special characters in values', () => {
    const testPath = join(testDir, 'special.vars')
    const vars = new Map<string, string>([
      ['URL', 'https://example.com/path?query=1&other=2'],
      ['WITH_EQUALS', 'key=value'],
      ['WITH_SPACES', 'hello world'],
      ['WITH_QUOTES', 'say "hello"'],
      ['UNICODE', 'caf\u00e9'],
    ])

    writeVarsFile(testPath, vars)

    const content = readFileSync(testPath, 'utf-8')
    expect(content).toContain('URL=https://example.com/path?query=1&other=2')
    expect(content).toContain('WITH_EQUALS=key=value')
    expect(content).toContain('WITH_SPACES=hello world')
    expect(content).toContain('WITH_QUOTES=say "hello"')
    expect(content).toContain('UNICODE=caf\u00e9')
  })

  test('roundtrips with parseVarsFile', () => {
    const testPath = join(testDir, 'roundtrip.vars')
    const original = new Map<string, string>([
      ['VAR_ONE', 'value1'],
      ['VAR_TWO', 'value2'],
      ['VAR_THREE', 'value3'],
    ])

    writeVarsFile(testPath, original)
    const parsed = parseVarsFile(testPath)

    expect(parsed.size).toBe(original.size)
    for (const [key, value] of original) {
      expect(parsed.get(key)).toBe(value)
    }
  })
})

describe('auth constants', () => {
  test('COMMON_AUTH_VARS contains expected values', () => {
    expect(COMMON_AUTH_VARS).toEqual(['BETTER_AUTH_SECRET'])
  })

  test('LOCAL_AUTH_VARS contains Google OAuth variables', () => {
    expect(LOCAL_AUTH_VARS).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])
  })

  test('CF_ACCESS_AUTH_VARS contains Cloudflare Access variables', () => {
    expect(CF_ACCESS_AUTH_VARS).toEqual(['CLOUDFLARE_ACCESS_TEAM'])
  })

  test('auth constant arrays are non-empty and contain strings', () => {
    expect(COMMON_AUTH_VARS.length).toBeGreaterThan(0)
    expect(LOCAL_AUTH_VARS.length).toBeGreaterThan(0)
    expect(CF_ACCESS_AUTH_VARS.length).toBeGreaterThan(0)

    for (const v of COMMON_AUTH_VARS) {
      expect(typeof v).toBe('string')
    }
    for (const v of LOCAL_AUTH_VARS) {
      expect(typeof v).toBe('string')
    }
    for (const v of CF_ACCESS_AUTH_VARS) {
      expect(typeof v).toBe('string')
    }
  })

  test('auth constant arrays have no overlap', () => {
    const all = [...COMMON_AUTH_VARS, ...LOCAL_AUTH_VARS, ...CF_ACCESS_AUTH_VARS]
    const unique = new Set(all)
    expect(unique.size).toBe(all.length)
  })
})

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
            // No AUTH_MODE - should default to local
      BETTER_AUTH_SECRET: 'some-secret-key-that-is-long-enough',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    })

    const result = validateInstanceVars('test')
    expect(result.valid).toBe(true)
  })
})
