import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Read the schema file
const schemaPath = join(__dirname, '../src/db/schema.d1.sql')
const schemaContent = readFileSync(schemaPath, 'utf-8')

// Required tables that must exist in the schema
const REQUIRED_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'projects',
  'deploys',
  'share_tokens',
  'apikey',
] as const

describe('schema.d1.sql', () => {
  describe('required tables', () => {
    for (const tableName of REQUIRED_TABLES) {
      test(`has ${tableName} table`, () => {
        // Match CREATE TABLE statements (with or without quotes around table name)
        const pattern = new RegExp(
          `CREATE\\s+TABLE\\s+(?:"?${tableName}"?)\\s*\\(`,
          'i'
        )
        expect(schemaContent).toMatch(pattern)
      })
    }
  })

  describe('table count', () => {
    test('has exactly the expected number of tables', () => {
      // Count CREATE TABLE statements
      const tableMatches = schemaContent.match(/CREATE\s+TABLE\s+/gi)
      const tableCount = tableMatches?.length ?? 0

      // We expect 8 required tables plus device_code (9 total)
      // If this changes, update REQUIRED_TABLES or this count
      expect(tableCount).toBe(9)
    })
  })

  describe('apikey table structure', () => {
    test('has required columns for BetterAuth apiKey plugin', () => {
      // Extract the apikey table definition
      const apikeyMatch = schemaContent.match(
        /CREATE\s+TABLE\s+apikey\s*\(([\s\S]*?)\);/i
      )
      expect(apikeyMatch).not.toBeNull()

      const tableDefinition = apikeyMatch![1]

      // Required columns for BetterAuth apiKey plugin
      const requiredColumns = [
        'id',
        'name',
        'key',
        'userId',
        'enabled',
        'expiresAt',
        'createdAt',
        'updatedAt',
      ]

      for (const column of requiredColumns) {
        expect(tableDefinition).toContain(column)
      }
    })
  })

  describe('foreign key relationships', () => {
    test('apikey references user table', () => {
      const apikeyMatch = schemaContent.match(
        /CREATE\s+TABLE\s+apikey\s*\(([\s\S]*?)\);/i
      )
      expect(apikeyMatch).not.toBeNull()
      expect(apikeyMatch![1]).toMatch(/REFERENCES\s+user\s*\(\s*id\s*\)/i)
    })

    test('session references user table', () => {
      const sessionMatch = schemaContent.match(
        /CREATE\s+TABLE\s+session\s*\(([\s\S]*?)\);/i
      )
      expect(sessionMatch).not.toBeNull()
      expect(sessionMatch![1]).toMatch(/REFERENCES\s+user\s*\(\s*id\s*\)/i)
    })

    test('projects references user table', () => {
      const projectsMatch = schemaContent.match(
        /CREATE\s+TABLE\s+projects\s*\(([\s\S]*?)\);/i
      )
      expect(projectsMatch).not.toBeNull()
      expect(projectsMatch![1]).toMatch(/REFERENCES\s+user\s*\(\s*id\s*\)/i)
    })

    test('deploys references projects table', () => {
      const deploysMatch = schemaContent.match(
        /CREATE\s+TABLE\s+deploys\s*\(([\s\S]*?)\);/i
      )
      expect(deploysMatch).not.toBeNull()
      expect(deploysMatch![1]).toMatch(/REFERENCES\s+projects\s*\(\s*id\s*\)/i)
    })

    test('share_tokens references projects and user tables', () => {
      const shareTokensMatch = schemaContent.match(
        /CREATE\s+TABLE\s+share_tokens\s*\(([\s\S]*?)\);/i
      )
      expect(shareTokensMatch).not.toBeNull()
      expect(shareTokensMatch![1]).toMatch(/REFERENCES\s+projects\s*\(\s*id\s*\)/i)
      expect(shareTokensMatch![1]).toMatch(/REFERENCES\s+user\s*\(\s*id\s*\)/i)
    })
  })

  describe('indexes', () => {
    test('has index on apikey.userId', () => {
      expect(schemaContent).toMatch(/CREATE\s+INDEX\s+\w*apikey.*ON\s+apikey\s*\(\s*userId\s*\)/i)
    })

    test('has index on apikey.key', () => {
      expect(schemaContent).toMatch(/CREATE\s+INDEX\s+\w*apikey.*ON\s+apikey\s*\(\s*key\s*\)/i)
    })
  })
})
