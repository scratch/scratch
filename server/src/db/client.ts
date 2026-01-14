// D1 database client with tagged template literal support
// Mirrors the interface of the previous Neon client for easy migration

export type DbClient = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  query<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>
}

export function createDbClient(db: D1Database): DbClient {
  const query = async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Convert tagged template to parameterized query
    // Template: sql`SELECT * FROM users WHERE id = ${id} AND name = ${name}`
    // Result: "SELECT * FROM users WHERE id = ? AND name = ?"
    const sql = strings.reduce((acc, str, i) => acc + str + (i < values.length ? '?' : ''), '')

    // Execute with bound parameters
    const result = await db.prepare(sql).bind(...values).all<T>()
    return result.results
  }

  // Create the client object
  const client: DbClient = Object.assign(
    // Make it callable as a tagged template literal
    <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) =>
      query<T>(strings, ...values),
    {
      query,
      transaction: async <T>(fn: (tx: DbClient) => Promise<T>): Promise<T> => {
        // D1 doesn't have real transactions yet, but serializes writes
        // For now, just execute - single-writer model handles concurrency
        // Note: This means transaction rollback won't work, but D1's
        // single-writer model provides atomicity for individual queries
        return fn(client)
      },
    }
  )

  return client
}
