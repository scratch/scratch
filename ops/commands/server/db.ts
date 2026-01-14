// Database commands

import { existsSync } from 'fs'
import { green, red, reset } from '../../lib/colors'
import { getInstanceResourceNames } from '../../lib/config'
import { getWranglerConfig } from '../../lib/process'

async function promptForConfirmation(message: string): Promise<string> {
  process.stdout.write(message)
  for await (const line of console) {
    return line.trim()
  }
  return ''
}

export async function dbTablesAction(instance: string): Promise<void> {
  console.log(`Listing tables for ${instance} D1 database...\n`)

  const wranglerConfig = getWranglerConfig(instance)
  const { dbName } = getInstanceResourceNames(instance)

  const proc = Bun.spawn(
    ['bunx', 'wrangler', 'd1', 'execute', dbName, '-c', wranglerConfig, '--remote', '--command',
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`],
    {
      cwd: 'server',
      stdout: 'pipe',
      stderr: 'pipe',
    }
  )

  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  if (exitCode !== 0) {
    console.error(`Error: ${stderr}`)
    process.exit(1)
  }

  console.log(stdout)
}

export async function dbQueryAction(instance: string, sql: string): Promise<void> {
  console.log(`Executing query on ${instance} D1 database...\n`)

  const wranglerConfig = getWranglerConfig(instance)
  const { dbName } = getInstanceResourceNames(instance)

  const proc = Bun.spawn(
    ['bunx', 'wrangler', 'd1', 'execute', dbName, '-c', wranglerConfig, '--remote', '--command', sql],
    {
      cwd: 'server',
      stdout: 'pipe',
      stderr: 'pipe',
    }
  )

  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  if (exitCode !== 0) {
    console.error(`Error: ${stderr}`)
    process.exit(1)
  }

  console.log(stdout)
}

export async function dbMigrateAction(instance: string): Promise<void> {
  console.log(`Running migrations on ${instance} D1 database...\n`)

  const wranglerConfig = getWranglerConfig(instance)
  const { dbName } = getInstanceResourceNames(instance)

  const schemaPath = 'server/src/db/schema.sql'
  if (!existsSync(schemaPath)) {
    console.error(`Error: ${schemaPath} not found`)
    process.exit(1)
  }

  const proc = Bun.spawn(
    ['bunx', 'wrangler', 'd1', 'execute', dbName, '-c', wranglerConfig, '--remote', '--file', 'src/db/schema.sql'],
    {
      cwd: 'server',
      stdout: 'pipe',
      stderr: 'pipe',
    }
  )

  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  if (exitCode !== 0) {
    console.error(`Migration failed: ${stderr}`)
    process.exit(1)
  }

  console.log(stdout)
  console.log(`${green}✓${reset} Migrations complete!`)
}

export async function dbDropAllAction(instance: string): Promise<void> {
  console.log(`Dropping all tables from ${instance} D1 database...\n`)

  const wranglerConfig = getWranglerConfig(instance)
  const { dbName } = getInstanceResourceNames(instance)

  const listProc = Bun.spawn(
    ['bunx', 'wrangler', 'd1', 'execute', dbName, '-c', wranglerConfig, '--remote', '--json', '--command',
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`],
    {
      cwd: 'server',
      stdout: 'pipe',
      stderr: 'pipe',
    }
  )

  const listExitCode = await listProc.exited
  const listStdout = await new Response(listProc.stdout).text()

  if (listExitCode !== 0) {
    const listStderr = await new Response(listProc.stderr).text()
    console.error(`Error listing tables: ${listStderr}`)
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

    const dropProc = Bun.spawn(
      ['bunx', 'wrangler', 'd1', 'execute', dbName, '-c', wranglerConfig, '--remote', '--command',
        `DROP TABLE IF EXISTS "${table}"`],
      {
        cwd: 'server',
        stdout: 'pipe',
        stderr: 'pipe',
      }
    )

    const dropExitCode = await dropProc.exited
    if (dropExitCode === 0) {
      console.log(`${green}✓${reset}`)
    } else {
      const dropStderr = await new Response(dropProc.stderr).text()
      console.log(`${red}✗${reset} ${dropStderr.trim()}`)
    }
  }

  console.log('\nAll tables dropped.')
}
