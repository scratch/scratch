import { Command } from 'commander'
import { withErrorHandling } from '../../index'
import { loginCommand, logoutCommand, whoamiCommand, configCommand, configUserCommand, cfAccessCommand } from './auth'
import { deployCommand } from './deploy'
import { listProjectsCommand, projectInfoCommand, projectDeleteCommand } from './projects'
import { shareCreateCommand, shareListCommand, shareRevokeCommand } from './share'

export function registerCloudCommands(program: Command): void {
  const cloud = program
    .command('cloud', { hidden: true })
    .description('Scratch Cloud commands')
    .hook('preAction', () => {
      console.warn('\x1b[33mWarning: Cloud commands are not fully implemented yet.\x1b[0m')
    })

  cloud
    .command('login')
    .description('Log in to Scratch Cloud')
    .action(withErrorHandling('cloud login', loginCommand))

  cloud
    .command('logout')
    .description('Log out from Scratch Cloud')
    .action(withErrorHandling('cloud logout', logoutCommand))

  cloud
    .command('whoami')
    .description('Show current user info')
    .action(withErrorHandling('cloud whoami', whoamiCommand))

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
    .action(withErrorHandling('cloud cf-access', cfAccessCommand))

  // Deploy command
  cloud
    .command('deploy [path]')
    .description('Deploy a project to Scratch Cloud')
    .option('--name <name>', 'Override project name')
    .option('--namespace <namespace>', 'Override namespace')
    .option('--no-build', 'Skip build step')
    .option('--dry-run', 'Show what would be deployed without uploading')
    .action(
      withErrorHandling('cloud deploy', async (projectPath: string | undefined, options: { name?: string; namespace?: string; build?: boolean; dryRun?: boolean }) => {
        await deployCommand(projectPath, {
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
    .action(withErrorHandling('cloud projects list', listProjectsCommand))

  projects
    .command('info [name]')
    .description('Show project details (uses .scratch/project.toml if no name specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(
      withErrorHandling('cloud projects info', async (name: string | undefined, options: { namespace?: string }) => {
        await projectInfoCommand(name, { namespace: options.namespace })
      })
    )

  projects
    .command('delete [name]')
    .description('Delete a project and all its deploys (uses .scratch/project.toml if no name specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(
      withErrorHandling('cloud projects delete', async (name: string | undefined, options: { namespace?: string }) => {
        await projectDeleteCommand(name, { namespace: options.namespace })
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
    .option('--name <name>', 'Token name')
    .option('--duration <duration>', 'Token duration (1d, 1w, 1m)')
    .action(
      withErrorHandling('cloud share', async (project: string | undefined, options: { namespace?: string; name?: string; duration?: string }) => {
        await shareCreateCommand(project, options)
      })
    )

  share
    .command('list [project]')
    .description('List share tokens (uses .scratch/project.toml if no project specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(
      withErrorHandling('cloud share list', async (project: string | undefined, options: { namespace?: string }) => {
        await shareListCommand(project, options)
      })
    )

  share
    .command('revoke <tokenId> [project]')
    .description('Revoke a share token (uses .scratch/project.toml if no project specified)')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(
      withErrorHandling('cloud share revoke', async (tokenId: string, project: string | undefined, options: { namespace?: string }) => {
        await shareRevokeCommand(tokenId, project, options)
      })
    )
}
