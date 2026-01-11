import { Command } from 'commander'
import { withErrorHandling } from '../../index'
import { CloudContext } from './context'
import { loginCommand, logoutCommand, whoamiCommand, configCommand, configUserCommand, cfAccessCommand } from './auth'
import { deployCommand } from './deploy'
import { listProjectsCommand, projectInfoCommand, projectDeleteCommand } from './projects'
import { shareCreateCommand, shareListCommand, shareRevokeCommand } from './share'

/**
 * Get the effective server URL option from the command's ancestry.
 * Commander.js doesn't automatically inherit parent options, so we traverse up.
 */
function getServerUrlOption(cmd: Command): string | undefined {
  let current: Command | null = cmd
  while (current) {
    const opts = current.opts()
    if (opts.serverUrl) {
      return opts.serverUrl
    }
    current = current.parent
  }
  return undefined
}

/**
 * Create a CloudContext from a command, inheriting --server-url from parent.
 */
function createContext(cmd: Command, projectPath?: string): CloudContext {
  return new CloudContext({
    serverUrl: getServerUrlOption(cmd),
    projectPath,
  })
}

export function registerCloudCommands(program: Command): void {
  const cloud = program
    .command('cloud', { hidden: true })
    .description('Scratch Cloud commands')
    .option('--server-url <url>', 'Override server URL')
    .hook('preAction', () => {
      console.warn('\x1b[33mWarning: Cloud commands are not fully implemented yet.\x1b[0m')
    })

  cloud
    .command('login')
    .description('Log in to Scratch Cloud')
    .option('--server-url <url>', 'Override server URL')
    .action(withErrorHandling('cloud login', async function(this: Command) {
      const ctx = createContext(this)
      await loginCommand(ctx)
    }))

  cloud
    .command('logout')
    .description('Log out from Scratch Cloud')
    .option('--server-url <url>', 'Override server URL')
    .action(withErrorHandling('cloud logout', async function(this: Command) {
      const ctx = createContext(this)
      await logoutCommand(ctx)
    }))

  cloud
    .command('whoami')
    .description('Show current user info')
    .option('--server-url <url>', 'Override server URL')
    .action(withErrorHandling('cloud whoami', async function(this: Command) {
      const ctx = createContext(this)
      await whoamiCommand(ctx)
    }))

  // Config commands
  const config = cloud
    .command('config')
    .description('Configure Scratch Cloud settings')

  config
    .command('project [path]', { isDefault: true })
    .description('Configure project settings (default)')
    .action(withErrorHandling('cloud config', async (projectPath?: string) => {
      await configCommand(projectPath)
    }))

  config
    .command('user')
    .description('Configure global user settings')
    .action(withErrorHandling('cloud config user', configUserCommand))

  cloud
    .command('cf-access')
    .description('Configure Cloudflare Access service token')
    .option('--server-url <url>', 'Override server URL')
    .action(withErrorHandling('cloud cf-access', async function(this: Command) {
      const ctx = createContext(this)
      await cfAccessCommand(ctx)
    }))

  // Deploy command
  cloud
    .command('deploy [path]')
    .description('Deploy a project to Scratch Cloud')
    .option('--name <name>', 'Override project name')
    .option('--namespace <namespace>', 'Override namespace')
    .option('--server-url <url>', 'Override server URL')
    .option('--no-build', 'Skip build step')
    .option('--dry-run', 'Show what would be deployed without uploading')
    .action(
      withErrorHandling('cloud deploy', async function(this: Command, projectPath: string | undefined, options: { name?: string; namespace?: string; build?: boolean; dryRun?: boolean }) {
        const ctx = createContext(this, projectPath)
        await deployCommand(ctx, projectPath, {
          name: options.name,
          namespace: options.namespace,
          noBuild: options.build === false,
          dryRun: options.dryRun === true,
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
    .option('--server-url <url>', 'Override server URL')
    .action(withErrorHandling('cloud projects list', async function(this: Command) {
      const ctx = createContext(this)
      await listProjectsCommand(ctx)
    }))

  projects
    .command('info [name]')
    .description('Show project details (uses .scratch/project.toml if no name specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .option('--server-url <url>', 'Override server URL')
    .action(
      withErrorHandling('cloud projects info', async function(this: Command, name: string | undefined, options: { namespace?: string }) {
        const ctx = createContext(this)
        await projectInfoCommand(ctx, name, { namespace: options.namespace })
      })
    )

  projects
    .command('delete [name]')
    .description('Delete a project and all its deploys (uses .scratch/project.toml if no name specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .option('--server-url <url>', 'Override server URL')
    .action(
      withErrorHandling('cloud projects delete', async function(this: Command, name: string | undefined, options: { namespace?: string }) {
        const ctx = createContext(this)
        await projectDeleteCommand(ctx, name, { namespace: options.namespace })
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
    .option('--namespace <namespace>', 'Specify namespace')
    .option('--server-url <url>', 'Override server URL')
    .option('--name <name>', 'Token name')
    .option('--duration <duration>', 'Token duration (1d, 1w, 1m)')
    .action(
      withErrorHandling('cloud share', async function(this: Command, project: string | undefined, options: { namespace?: string; name?: string; duration?: string }) {
        const ctx = createContext(this)
        await shareCreateCommand(ctx, project, options)
      })
    )

  share
    .command('list [project]')
    .description('List share tokens (uses .scratch/project.toml if no project specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .option('--server-url <url>', 'Override server URL')
    .action(
      withErrorHandling('cloud share list', async function(this: Command, project: string | undefined, options: { namespace?: string }) {
        const ctx = createContext(this)
        await shareListCommand(ctx, project, options)
      })
    )

  share
    .command('revoke <tokenId> [project]')
    .description('Revoke a share token (uses .scratch/project.toml if no project specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .option('--server-url <url>', 'Override server URL')
    .action(
      withErrorHandling('cloud share revoke', async function(this: Command, tokenId: string, project: string | undefined, options: { namespace?: string }) {
        const ctx = createContext(this)
        await shareRevokeCommand(ctx, tokenId, project, options)
      })
    )
}
