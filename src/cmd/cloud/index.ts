import { Command } from 'commander'
import { withErrorHandling } from '../../index'
import { loginCommand, logoutCommand, whoamiCommand, configCommand } from './auth'
import { deployCommand } from './deploy'
import { listProjectsCommand, projectInfoCommand, projectDeleteCommand } from './projects'

export function registerCloudCommands(program: Command): void {
  const cloud = program
    .command('cloud')
    .description('Scratch Cloud commands')

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

  cloud
    .command('config')
    .description('Configure Scratch Cloud settings')
    .action(withErrorHandling('cloud config', configCommand))

  // Deploy command
  cloud
    .command('deploy [path]')
    .description('Deploy a project to Scratch Cloud')
    .option('--name <name>', 'Override project name')
    .option('--namespace <namespace>', 'Override namespace')
    .option('--no-build', 'Skip build step')
    .action(
      withErrorHandling('cloud deploy', async (projectPath: string | undefined, options: { name?: string; namespace?: string; build?: boolean }) => {
        await deployCommand(projectPath, {
          name: options.name,
          namespace: options.namespace,
          noBuild: options.build === false,
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
    .command('info <name>')
    .description('Show project details')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(
      withErrorHandling('cloud projects info', async (name: string, options: { namespace?: string }) => {
        await projectInfoCommand(name, { namespace: options.namespace })
      })
    )

  projects
    .command('delete <name>')
    .description('Delete a project and all its deploys')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(
      withErrorHandling('cloud projects delete', async (name: string, options: { namespace?: string }) => {
        await projectDeleteCommand(name, { namespace: options.namespace })
      })
    )
}
