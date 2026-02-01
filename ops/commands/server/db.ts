// Database commands

import { existsSync } from 'fs'
import { green, red, reset } from '../../lib/output'
import { getInstanceResourceNames } from '../../lib/config'
import { getWranglerConfig } from '../../lib/process'

async function promptForConfirmation(message: string): Promise<string> {
  process.stdout.write(message)
  for await (const line of console) {
    return line.trim()
  }
  return ''
}

/**
 * Execute a D1 query against an instance's database.
 * Builds and runs the wrangler d1 execute command with proper configuration.
 *
 * @param instance - The instance name (e.g., 'staging', 'prod')
 * @param args - Additional arguments for the wrangler d1 execute command (e.g., ['--command', 'SELECT ...'])
 * @param options - Optional settings
 * @param options.json - If true, adds --json flag for JSON output
 * @returns The stdout output from the command
 * @throws Error if the command fails (non-zero exit code)
 */
export async function runD1Query(
  instance: string,
  args: string[],
  options?: { json?: boolean }
): Promise<string> {
  const wranglerConfig = getWranglerConfig(instance)
  const { dbName } = getInstanceResourceNames(instance)

  const fullArgs = [
    'bunx', 'wrangler', 'd1', 'execute', dbName,
    '-c', wranglerConfig, '--remote',
    ...(options?.json ? ['--json'] : []),
    ...args,
  ]

  const proc = Bun.spawn(fullArgs, {
    cwd: 'server',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr)
  }

  return stdout
}

export async function dbTablesAction(instance: string): Promise<void> {
  console.log(`Listing tables for ${instance} D1 database...\n`)

  try {
    const result = await runD1Query(instance, [
      '--command',
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`,
    ])
    console.log(result)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}

export async function dbQueryAction(instance: string, sql: string): Promise<void> {
  console.log(`Executing query on ${instance} D1 database...\n`)

  try {
    const result = await runD1Query(instance, ['--command', sql])
    console.log(result)
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}

export async function dbMigrateAction(instance: string): Promise<void> {
  console.log(`Running migrations on ${instance} D1 database...\n`)

  const schemaPath = 'server/src/db/schema.d1.sql'
  if (!existsSync(schemaPath)) {
    console.error(`Error: ${schemaPath} not found`)
    process.exit(1)
  }

  try {
    const result = await runD1Query(instance, ['--file', 'src/db/schema.d1.sql'])
    console.log(result)
    console.log(`${green}✓${reset} Migrations complete!`)
  } catch (error) {
    console.error(`Migration failed: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}

export async function dbDropAllAction(instance: string): Promise<void> {
  console.log(`Dropping all tables from ${instance} D1 database...\n`)

  let listStdout: string
  try {
    listStdout = await runD1Query(
      instance,
      ['--command', `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`],
      { json: true }
    )
  } catch (error) {
    console.error(`Error listing tables: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  let tables: string[] = []
  try {
    const result = JSON.parse(listStdout)
    if (result && result[0] && result[0].results) {
      tables = result[0].results.map((r: { name: string }) => r.name)
    }
  } catch {
    console.log('No tables found or could not parse response.')
    return
  }

  if (tables.length === 0) {
    console.log('No tables to drop.')
    return
  }

  console.log(`Tables to drop: ${tables.join(', ')}\n`)

  if (instance.startsWith('prod')) {
    console.log(`${red}WARNING: You are about to drop all tables in ${instance.toUpperCase()}!${reset}\n`)
    const answer = await promptForConfirmation('Type "DROP ALL" to confirm: ')
    if (answer !== 'DROP ALL') {
      console.log('\nAborted.')
      process.exit(1)
    }
    console.log('')
  }

  console.log(`Dropping ${tables.length} tables...\n`)

  for (const table of tables) {
    process.stdout.write(`  Dropping ${table}... `)

    try {
      await runD1Query(instance, ['--command', `DROP TABLE IF EXISTS "${table}"`])
      console.log(`${green}✓${reset}`)
    } catch (error) {
      console.log(`${red}✗${reset} ${error instanceof Error ? error.message.trim() : error}`)
    }
  }

  console.log('\nAll tables dropped.')
}
