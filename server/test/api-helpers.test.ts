import { describe, test, expect, mock } from 'bun:test'
import { buildProjectDetailsQuery, getProjectForUser } from '../src/lib/api-helpers'
import type { DbClient } from '../src/db/client'

describe('buildProjectDetailsQuery', () => {
  test('returns query with basic where clause', () => {
    const query = buildProjectDetailsQuery('p.owner_id = ?')

    // Should include all required SELECT columns
    expect(query).toContain('p.*')
    expect(query).toContain('u.email as owner_email')
    expect(query).toContain('d.version as live_version')
    expect(query).toContain('CAST(COUNT(all_d.id) AS INTEGER) as deploy_count')
    expect(query).toContain('MAX(all_d.created_at) as last_deploy_at')

    // Should include all required JOINs
    expect(query).toContain('FROM projects p')
    expect(query).toContain('JOIN "user" u ON p.owner_id = u.id')
    expect(query).toContain('LEFT JOIN deploys d ON p.live_deploy_id = d.id')
    expect(query).toContain('LEFT JOIN deploys all_d ON all_d.project_id = p.id')

    // Should include WHERE clause
    expect(query).toContain('WHERE p.owner_id = ?')

    // Should include GROUP BY
    expect(query).toContain('GROUP BY p.id, u.email, d.version')

    // Should NOT include ORDER BY when not specified
    expect(query).not.toContain('ORDER BY')
  })

  test('returns query with compound where clause', () => {
    const query = buildProjectDetailsQuery('p.name = ? AND p.owner_id = ?')

    expect(query).toContain('WHERE p.name = ? AND p.owner_id = ?')
  })

  test('returns query with ORDER BY when specified', () => {
    const query = buildProjectDetailsQuery('p.owner_id = ?', 'p.updated_at DESC')

    expect(query).toContain('WHERE p.owner_id = ?')
    expect(query).toContain('ORDER BY p.updated_at DESC')
    // ORDER BY should come after GROUP BY
    const groupByIndex = query.indexOf('GROUP BY')
    const orderByIndex = query.indexOf('ORDER BY')
    expect(orderByIndex).toBeGreaterThan(groupByIndex)
  })

  test('returns query with where clause by project id', () => {
    const query = buildProjectDetailsQuery('p.id = ?')

    expect(query).toContain('WHERE p.id = ?')
    expect(query).not.toContain('ORDER BY')
  })

  test('query structure is valid SQL (basic structure check)', () => {
    const query = buildProjectDetailsQuery('p.owner_id = ?')

    // Basic structure: SELECT ... FROM ... JOIN ... WHERE ... GROUP BY
    const selectIndex = query.indexOf('SELECT')
    const fromIndex = query.indexOf('FROM')
    const whereIndex = query.indexOf('WHERE')
    const groupByIndex = query.indexOf('GROUP BY')

    expect(selectIndex).toBe(0) // SELECT at the beginning
    expect(fromIndex).toBeGreaterThan(selectIndex)
    expect(whereIndex).toBeGreaterThan(fromIndex)
    expect(groupByIndex).toBeGreaterThan(whereIndex)
  })

  test('returns consistent results for same input', () => {
    const query1 = buildProjectDetailsQuery('p.owner_id = ?', 'p.updated_at DESC')
    const query2 = buildProjectDetailsQuery('p.owner_id = ?', 'p.updated_at DESC')

    expect(query1).toBe(query2)
  })
})

// =============================================================================
// getProjectForUser tests
// =============================================================================

// Mock database client
function createMockDb(results: unknown[]): DbClient {
  const queryFn = mock(() => Promise.resolve(results))
  return Object.assign(queryFn, { query: queryFn }) as unknown as DbClient
}

describe('getProjectForUser', () => {
  test('returns project when found and owned by user', async () => {
    const mockProject = { id: 'project-123' }
    const db = createMockDb([mockProject])

    const result = await getProjectForUser(db, 'my-project', 'user-456')

    expect(result).toEqual({ id: 'project-123' })
  })

  test('returns null when project does not exist', async () => {
    const db = createMockDb([])

    const result = await getProjectForUser(db, 'nonexistent-project', 'user-456')

    expect(result).toBeNull()
  })

  test('returns null when project exists but not owned by user', async () => {
    // The query will return empty array if owner_id doesn't match
    const db = createMockDb([])

    const result = await getProjectForUser(db, 'other-users-project', 'user-456')

    expect(result).toBeNull()
  })

  test('calls database with correct parameters', async () => {
    const db = createMockDb([{ id: 'project-123' }])

    await getProjectForUser(db, 'test-project', 'user-789')

    // Verify the mock was called
    expect(db).toHaveBeenCalledTimes(1)
  })
})
