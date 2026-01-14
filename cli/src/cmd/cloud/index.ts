import { Command } from 'commander'
import { withErrorHandling } from '../../index'
import { CloudContext } from './context'
import { loginCommand, logoutCommand, whoamiCommand, configCommand, configUserCommand, cfAccessCommand } from './auth'
import { deployCommand } from './deploy'
import { listProjectsCommand, projectInfoCommand, projectDeleteCommand } from './projects'
import { shareCreateCommand, shareListCommand, shareRevokeCommand } from './share'

/**
 * Create a CloudContext with the given options.
 */
function createContext(serverUrl: string | undefined, projectPath?: string): CloudContext {
  return new CloudContext({
    serverUrl,
    projectPath,
  })
}

/**
 * Get serverUrl from Command using optsWithGlobals() to include parent options.
 */
function getServerUrl(cmd: Command): string | undefined {
  return cmd.optsWithGlobals().serverUrl
}

export function registerCloudCommands(program: Command): void {
  const cloud = program
    .command('cloud', { hidden: true })
    .description('Scratch Cloud commands')
    .option('--server-url <url>', 'Override server URL')
    .hook('preAction', () => {
      console.warn('\x1b[33mWarning: Cloud commands are not fully implemented yet.\x1b[0m')
    })

  // For commands without positional args: Commander passes (options, cmd)
  // For commands with positional args: Commander passes (arg1, ..., options, cmd)
  // We use optsWithGlobals() on cmd to get inherited --server-url from parent

  cloud
    .command('login')
    .description('Log in to Scratch Cloud')
    .option('--timeout <minutes>', 'Timeout in minutes for login approval (default: 10)')
    .action(withErrorHandling('cloud login', async (_options: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals()
      const ctx = createContext(getServerUrl(cmd))
      await loginCommand(ctx, { timeout: opts.timeout ? parseFloat(opts.timeout) : undefined })
    }))

  cloud
    .command('logout')
    .description('Log out from Scratch Cloud')
    .action(withErrorHandling('cloud logout', async (_options: unknown, cmd: Command) => {
      const ctx = createContext(getServerUrl(cmd))
      await logoutCommand(ctx)
    }))

  cloud
    .command('whoami')
    .description('Show current user info')
    .action(withErrorHandling('cloud whoami', async (_options: unknown, cmd: Command) => {
      const ctx = createContext(getServerUrl(cmd))
      await whoamiCommand(ctx)
    }))

  // Config commands
  const config = cloud
    .command('config')
    .description('Configure Scratch Cloud settings')

  config
    .command('project [path]', { isDefault: true })
    .description('Configure project settings (default)')
    .action(withErrorHandling('cloud config', async (projectPath: string | undefined) => {
      await configCommand(projectPath)
    }))

  config
    .command('user')
    .description('Configure global user settings')
    .action(withErrorHandling('cloud config user', configUserCommand))

  cloud
    .command('cf-access')
    .description('Configure Cloudflare Access service token')
    .action(withErrorHandling('cloud cf-access', async (_options: unknown, cmd: Command) => {
      const ctx = createContext(getServerUrl(cmd))
      await cfAccessCommand(ctx)
    }))

  // Deploy command
  cloud
    .command('deploy [path]')
    .description('Deploy a project to Scratch Cloud')
    .option('--name <name>', 'Override project name')
    .option('--visibility <visibility>', 'Override visibility (public, private, @domain, or email list)')
    .option('--no-build', 'Skip build step')
    .option('--dry-run', 'Show what would be deployed without uploading')
    .action(
      withErrorHandling('cloud deploy', async (projectPath: string | undefined, _options: unknown, cmd: Command) => {
        const opts = cmd.optsWithGlobals()
        const ctx = createContext(opts.serverUrl, projectPath)
        await deployCommand(ctx, projectPath, {
          name: opts.name,
          visibility: opts.visibility,
          noBuild: opts.build === false,
          dryRun: opts.dryRun === true,
        })
      })
    )

  // Projects commands
  const projects = cloud
    .command('projects')
    .description('Manage projects')

  projects
    .command('list', { isDefault: true })
    .description('List all projects')
    .action(withErrorHandling('cloud projects list', async (_options: unknown, cmd: Command) => {
      const ctx = createContext(getServerUrl(cmd))
      await listProjectsCommand(ctx)
    }))

  projects
    .command('info [name]')
    .description('Show project details (uses .scratch/project.toml if no name specified)')
    .action(
      withErrorHandling('cloud projects info', async (name: string | undefined, _options: unknown, cmd: Command) => {
        const opts = cmd.optsWithGlobals()
        const ctx = createContext(opts.serverUrl)
        await projectInfoCommand(ctx, name)
      })
    )

  projects
    .command('delete [name]')
    .description('Delete a project and all its deploys (uses .scratch/project.toml if no name specified)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(
      withErrorHandling('cloud projects delete', async (name: string | undefined, _options: unknown, cmd: Command) => {
        const opts = cmd.optsWithGlobals()
        const ctx = createContext(opts.serverUrl)
        await projectDeleteCommand(ctx, name, { force: opts.force })
      })
    )

  // Share commands - `cloud share [project]` creates a token (default)
  // If no project specified, uses .scratch/project.toml
  const share = cloud
    .command('share')
    .description('Create and manage share tokens for anonymous access')

  // Default: create a share token
  share
    .command('create [project]', { isDefault: true })
    .description('Create a share token (uses .scratch/project.toml if no project specified)')
    .option('--name <name>', 'Token name')
    .option('--duration <duration>', 'Token duration (1d, 1w, 1m)')
    .action(
      withErrorHandling('cloud share', async (project: string | undefined, _options: unknown, cmd: Command) => {
        const opts = cmd.optsWithGlobals()
        const ctx = createContext(opts.serverUrl)
        await shareCreateCommand(ctx, project, { name: opts.name, duration: opts.duration })
      })
    )

  share
    .command('list [project]')
    .description('List share tokens (uses .scratch/project.toml if no project specified)')
    .action(
      withErrorHandling('cloud share list', async (project: string | undefined, _options: unknown, cmd: Command) => {
        const opts = cmd.optsWithGlobals()
        const ctx = createContext(opts.serverUrl)
        await shareListCommand(ctx, project)
      })
    )

  share
    .command('revoke <tokenId> [project]')
    .description('Revoke a share token (uses .scratch/project.toml if no project specified)')
    .action(
      withErrorHandling('cloud share revoke', async (tokenId: string, project: string | undefined, _options: unknown, cmd: Command) => {
        const opts = cmd.optsWithGlobals()
        const ctx = createContext(opts.serverUrl)
        await shareRevokeCommand(ctx, tokenId, project)
      })
    )
}
