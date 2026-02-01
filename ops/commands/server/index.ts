// Server command registration

import { Command } from 'commander'
import { requireInstance } from '../../lib/process'
import { setupAction } from './setup'
import { deployAction, logsAction } from './deploy'
import { configCheckAction, configPushAction } from './config'
import { dbTablesAction, dbQueryAction, dbMigrateAction, dbDropAllAction } from './db'
import { integrationTestAction } from './test/index'
import { regenerateEnvAction } from './env'
import { runRelease, type BumpType } from '../release'

export function registerServerCommands(program: Command): void {
  const server = program
    .command('server')
    .description('Server operations')
    .option('-i, --instance <instance>', 'Instance name (e.g., prod, staging, dev)')

  // Setup
  server
    .command('setup')
    .description('Create Cloudflare resources and configure an instance')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'setup')
      try {
        await setupAction(instance)
      } catch (error: any) {
        if (error?.name === 'ExitPromptError' || error?.message?.includes('User force closed')) {
          console.log('\nCancelled.')
          process.exit(0)
        }
        throw error
      }
    })

  // Deploy
  server
    .command('deploy')
    .description('Deploy server to Cloudflare Workers')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'deploy')
      await deployAction(instance)
    })

  // Logs
  server
    .command('logs')
    .description('Tail worker logs for an instance')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'logs')
      await logsAction(instance)
    })

  // Config subcommands
  const config = server
    .command('config')
    .description('Configuration management')

  config
    .command('check')
    .option('--fix', 'Show commands to fix issues')
    .description('Validate configuration files')
    .action(async (options: { fix?: boolean }) => {
      const instance = requireInstance(server.opts().instance, 'config check')
      await configCheckAction(instance, options)
    })

  config
    .command('push')
    .description('Push instance vars to Cloudflare secrets')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'config push')
      await configPushAction(instance)
    })

  // DB subcommands
  const db = server
    .command('db')
    .description('D1 database operations')

  db.command('tables')
    .description('List all tables in the D1 database')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'db tables')
      await dbTablesAction(instance)
    })

  db.command('query')
    .argument('<sql>', 'SQL query to execute')
    .description('Run an arbitrary SQL query on the D1 database')
    .action(async (sql: string) => {
      const instance = requireInstance(server.opts().instance, 'db query')
      await dbQueryAction(instance, sql)
    })

  db.command('migrate')
    .description('Run database migrations from schema.d1.sql')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'db migrate')
      await dbMigrateAction(instance)
    })

  db.command('drop-all')
    .description('Drop all tables (prod requires confirmation)')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'db drop-all')
      await dbDropAllAction(instance)
    })

  // Test command - integration test against specified instance
  server
    .command('test')
    .description('Run integration test against an instance')
    .action(async () => {
      const instance = requireInstance(server.opts().instance, 'test')
      await integrationTestAction(instance)
    })

  // Regenerate env.ts (no instance required)
  server
    .command('regenerate-env-ts')
    .description('Regenerate server/src/env.ts from .vars.example')
    .action(regenerateEnvAction)

  // Release command (no instance required)
  server
    .command('release [type]')
    .description('Release server (type: patch, minor, major)')
    .action(async (type?: string) => {
      const bumpType: BumpType = (type as BumpType) || 'patch'
      if (!['patch', 'minor', 'major'].includes(bumpType)) {
        console.error('Error: Invalid bump type. Use: patch, minor, or major')
        process.exit(1)
      }
      await runRelease('server', bumpType)
    })
}
