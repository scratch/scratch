import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import fs from 'fs/promises'
import path from 'path'
import { mkTempDir } from '../../test-util'
import { loadSecureJsonFile, saveSecureJsonFile } from '../../../src/config/secure-json'

describe('loadSecureJsonFile', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkTempDir('secure-json-load-')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('returns default value when file does not exist', async () => {
    const filePath = path.join(tempDir, 'nonexistent.json')
    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('returns custom default value when file does not exist', async () => {
    const filePath = path.join(tempDir, 'nonexistent.json')
    const defaultValue = { key: 'value' }
    const result = await loadSecureJsonFile(filePath, defaultValue)
    expect(result).toEqual(defaultValue)
  })

  test('loads valid JSON object', async () => {
    const filePath = path.join(tempDir, 'data.json')
    const data = { name: 'test', value: 42 }
    await fs.writeFile(filePath, JSON.stringify(data))

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual(data)
  })

  test('loads nested JSON object', async () => {
    const filePath = path.join(tempDir, 'nested.json')
    const data = {
      server1: { token: 'abc', user: { id: '123', email: 'test@example.com' } },
      server2: { token: 'def', user: { id: '456', email: 'other@example.com' } },
    }
    await fs.writeFile(filePath, JSON.stringify(data))

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual(data)
  })

  test('returns default value for invalid JSON', async () => {
    const filePath = path.join(tempDir, 'invalid.json')
    await fs.writeFile(filePath, 'not valid json {{{')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('returns default value for JSON null', async () => {
    const filePath = path.join(tempDir, 'null.json')
    await fs.writeFile(filePath, 'null')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('returns default value for JSON array', async () => {
    const filePath = path.join(tempDir, 'array.json')
    await fs.writeFile(filePath, '["item1", "item2"]')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('returns default value for JSON string', async () => {
    const filePath = path.join(tempDir, 'string.json')
    await fs.writeFile(filePath, '"just a string"')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('returns default value for JSON number', async () => {
    const filePath = path.join(tempDir, 'number.json')
    await fs.writeFile(filePath, '42')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('returns default value for JSON boolean', async () => {
    const filePath = path.join(tempDir, 'bool.json')
    await fs.writeFile(filePath, 'true')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('returns default value for empty file', async () => {
    const filePath = path.join(tempDir, 'empty.json')
    await fs.writeFile(filePath, '')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('loads empty object', async () => {
    const filePath = path.join(tempDir, 'empty-obj.json')
    await fs.writeFile(filePath, '{}')

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual({})
  })

  test('preserves special characters in values', async () => {
    const filePath = path.join(tempDir, 'special.json')
    const data = { email: 'test+tag@example.com', url: 'https://example.com/path?q=1&b=2' }
    await fs.writeFile(filePath, JSON.stringify(data))

    const result = await loadSecureJsonFile(filePath)
    expect(result).toEqual(data)
  })

  test('preserves null values in objects', async () => {
    const filePath = path.join(tempDir, 'nullvals.json')
    const data = { name: null, value: 'defined' }
    await fs.writeFile(filePath, JSON.stringify(data))

    const result = await loadSecureJsonFile<{ name: string | null; value: string }>(filePath)
    expect(result.name).toBeNull()
    expect(result.value).toBe('defined')
  })
})

describe('saveSecureJsonFile', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkTempDir('secure-json-save-')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('creates file with 0o600 permissions', async () => {
    const filePath = path.join(tempDir, 'secure.json')
    await saveSecureJsonFile(filePath, { key: 'value' })

    const stats = await fs.stat(filePath)
    // Mode includes file type bits, mask with 0o777 to get just permissions
    expect(stats.mode & 0o777).toBe(0o600)
  })

  test('creates parent directories if they do not exist', async () => {
    const filePath = path.join(tempDir, 'nested', 'deeply', 'data.json')
    await saveSecureJsonFile(filePath, { key: 'value' })

    const content = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual({ key: 'value' })
  })

  test('writes formatted JSON with 2-space indentation', async () => {
    const filePath = path.join(tempDir, 'formatted.json')
    await saveSecureJsonFile(filePath, { key: 'value', nested: { a: 1 } })

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toContain('  "key"')
    expect(content).toContain('  "nested"')
    expect(content).toContain('    "a"')
  })

  test('appends newline at end of file', async () => {
    const filePath = path.join(tempDir, 'newline.json')
    await saveSecureJsonFile(filePath, { key: 'value' })

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content.endsWith('\n')).toBe(true)
  })

  test('overwrites existing file', async () => {
    const filePath = path.join(tempDir, 'overwrite.json')
    await fs.writeFile(filePath, '{"old": "data"}')

    await saveSecureJsonFile(filePath, { new: 'data' })

    const content = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual({ new: 'data' })
  })

  test('updates permissions on existing file with different permissions', async () => {
    const filePath = path.join(tempDir, 'insecure.json')
    await fs.writeFile(filePath, '{}', { mode: 0o644 })

    // Verify file has insecure permissions first
    let stats = await fs.stat(filePath)
    expect(stats.mode & 0o777).toBe(0o644)

    await saveSecureJsonFile(filePath, { secured: true })

    // Now permissions should be secure
    stats = await fs.stat(filePath)
    expect(stats.mode & 0o777).toBe(0o600)
  })

  test('writes empty object', async () => {
    const filePath = path.join(tempDir, 'empty.json')
    await saveSecureJsonFile(filePath, {})

    const content = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual({})
  })

  test('writes nested objects correctly', async () => {
    const filePath = path.join(tempDir, 'nested.json')
    const data = {
      'https://server1.com': { token: 'abc', user: { id: '1', email: 'a@b.com' } },
      'https://server2.com': { token: 'def', user: { id: '2', email: 'c@d.com' } },
    }
    await saveSecureJsonFile(filePath, data)

    const content = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual(data)
  })

  test('preserves null values', async () => {
    const filePath = path.join(tempDir, 'nullvals.json')
    const data = { name: null, value: 'test' }
    await saveSecureJsonFile(filePath, data)

    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    expect(parsed.name).toBeNull()
    expect(parsed.value).toBe('test')
  })

  test('handles special characters in keys and values', async () => {
    const filePath = path.join(tempDir, 'special.json')
    const data = {
      'https://example.com:8080/api': 'value with "quotes"',
      key: 'value\nwith\nnewlines',
    }
    await saveSecureJsonFile(filePath, data)

    const content = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(content)).toEqual(data)
  })
})

describe('loadSecureJsonFile and saveSecureJsonFile roundtrip', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkTempDir('secure-json-roundtrip-')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('data survives save and load roundtrip', async () => {
    const filePath = path.join(tempDir, 'roundtrip.json')
    const originalData = {
      'https://app.scratch.dev': {
        token: 'test-token',
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
      },
      'http://localhost:8788': {
        token: 'local-token',
        user: { id: 'user-456', email: 'local@example.com', name: null },
      },
    }

    await saveSecureJsonFile(filePath, originalData)
    const loadedData = await loadSecureJsonFile(filePath)

    expect(loadedData).toEqual(originalData)
  })

  test('multiple save/load cycles preserve data', async () => {
    const filePath = path.join(tempDir, 'multi-roundtrip.json')

    // First save
    const data1 = { key1: 'value1' }
    await saveSecureJsonFile(filePath, data1)
    expect(await loadSecureJsonFile(filePath)).toEqual(data1)

    // Second save (update)
    const data2 = { key1: 'updated', key2: 'new' }
    await saveSecureJsonFile(filePath, data2)
    expect(await loadSecureJsonFile(filePath)).toEqual(data2)

    // Third save (remove key)
    const data3 = { key2: 'only' }
    await saveSecureJsonFile(filePath, data3)
    expect(await loadSecureJsonFile(filePath)).toEqual(data3)
  })

  test('permissions remain secure after multiple operations', async () => {
    const filePath = path.join(tempDir, 'secure-ops.json')

    await saveSecureJsonFile(filePath, { step: 1 })
    let stats = await fs.stat(filePath)
    expect(stats.mode & 0o777).toBe(0o600)

    await saveSecureJsonFile(filePath, { step: 2 })
    stats = await fs.stat(filePath)
    expect(stats.mode & 0o777).toBe(0o600)

    await saveSecureJsonFile(filePath, { step: 3 })
    stats = await fs.stat(filePath)
    expect(stats.mode & 0o777).toBe(0o600)
  })
})
