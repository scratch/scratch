import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createDbClient, type DbClient } from '../src/db/client'

describe('createDbClient', () => {
  let mockDb: D1Database
  let mockPreparedStatement: D1PreparedStatement
  let db: DbClient

  beforeEach(() => {
    // Create mock prepared statement
    mockPreparedStatement = {
      bind: mock(() => mockPreparedStatement),
      all: mock(() => Promise.resolve({ results: [] })),
      first: mock(() => Promise.resolve(null)),
      run: mock(() => Promise.resolve({ success: true, meta: {} })),
      raw: mock(() => Promise.resolve([])),
    } as unknown as D1PreparedStatement

    // Create mock D1Database
    mockDb = {
      prepare: mock(() => mockPreparedStatement),
      dump: mock(),
      batch: mock(),
      exec: mock(),
    } as unknown as D1Database

    db = createDbClient(mockDb)
  })

  describe('tagged template literal queries', () => {
    test('executes simple query without parameters', async () => {
      const expectedResults = [{ id: '1', name: 'test' }]
      ;(mockPreparedStatement.all as ReturnType<typeof mock>).mockResolvedValue({
        results: expectedResults,
      })

      const results = await db`SELECT * FROM users`

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users')
      expect(mockPreparedStatement.bind).toHaveBeenCalledWith()
      expect(results).toEqual(expectedResults)
    })

    test('executes query with single parameter', async () => {
      const userId = 'user-123'
      const expectedResults = [{ id: userId, name: 'test' }]
      ;(mockPreparedStatement.all as ReturnType<typeof mock>).mockResolvedValue({
        results: expectedResults,
      })

      const results = await db`SELECT * FROM users WHERE id = ${userId}`

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?')
      expect(mockPreparedStatement.bind).toHaveBeenCalledWith(userId)
      expect(results).toEqual(expectedResults)
    })

    test('executes query with multiple parameters', async () => {
      const userId = 'user-123'
      const email = 'test@example.com'
      const expectedResults = [{ id: userId, email }]
      ;(mockPreparedStatement.all as ReturnType<typeof mock>).mockResolvedValue({
        results: expectedResults,
      })

      const results = await db`
        SELECT * FROM users
        WHERE id = ${userId} AND email = ${email}
      `

      expect(mockDb.prepare).toHaveBeenCalledWith(
        '\n        SELECT * FROM users\n        WHERE id = ? AND email = ?\n      '
      )
      expect(mockPreparedStatement.bind).toHaveBeenCalledWith(userId, email)
      expect(results).toEqual(expectedResults)
    })

    test('returns empty array when no results', async () => {
      ;(mockPreparedStatement.all as ReturnType<typeof mock>).mockResolvedValue({
        results: [],
      })

      const results = await db`SELECT * FROM users WHERE id = ${'nonexistent'}`

      expect(results).toEqual([])
    })

    test('supports typed results', async () => {
      interface User {
        id: string
        email: string
      }
      const expectedResults: User[] = [{ id: '1', email: 'test@example.com' }]
      ;(mockPreparedStatement.all as ReturnType<typeof mock>).mockResolvedValue({
        results: expectedResults,
      })

      const results = await db<User>`SELECT * FROM users`

      expect(results).toEqual(expectedResults)
      // TypeScript should infer results as User[]
      const firstUser = results[0]
      expect(firstUser.id).toBe('1')
      expect(firstUser.email).toBe('test@example.com')
    })
  })

  describe('query method', () => {
    test('works the same as tagged template literal', async () => {
      const userId = 'user-123'
      const expectedResults = [{ id: userId }]
      ;(mockPreparedStatement.all as ReturnType<typeof mock>).mockResolvedValue({
        results: expectedResults,
      })

      // Using query method directly
      const strings = ['SELECT * FROM users WHERE id = ', ''] as unknown as TemplateStringsArray
      const results = await db.query(strings, userId)

      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?')
      expect(mockPreparedStatement.bind).toHaveBeenCalledWith(userId)
      expect(results).toEqual(expectedResults)
    })
  })

  describe('DbClient interface', () => {
    test('does not have transaction method', () => {
      // Verify that the transaction method has been removed
      expect('transaction' in db).toBe(false)
    })

    test('is callable as a tagged template literal', () => {
      // Verify db can be called directly as a function
      expect(typeof db).toBe('function')
    })

    test('has query method', () => {
      expect(typeof db.query).toBe('function')
    })
  })
})
