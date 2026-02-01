// D1 database client with tagged template literal support
// Mirrors the interface of the previous Neon client for easy migration

export type DbClient = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
  query<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>
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
    }
  )

  return client
}
