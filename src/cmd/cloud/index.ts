import { Command } from 'commander'
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
    .action(async () => {
      try {
        await loginCommand()
      } catch (error: any) {
        console.error('Login failed:', error.message)
        process.exit(1)
      }
    })

  cloud
    .command('logout')
    .description('Log out from Scratch Cloud')
    .action(async () => {
      try {
        await logoutCommand()
      } catch (error: any) {
        console.error('Logout failed:', error.message)
        process.exit(1)
      }
    })

  cloud
    .command('whoami')
    .description('Show current user info')
    .action(async () => {
      try {
        await whoamiCommand()
      } catch (error: any) {
        console.error('Failed to get user info:', error.message)
        process.exit(1)
      }
    })

  cloud
    .command('config')
    .description('Configure Scratch Cloud settings')
    .action(async () => {
      try {
        await configCommand()
      } catch (error: any) {
        console.error('Configuration failed:', error.message)
        process.exit(1)
      }
    })

  // Deploy command
  cloud
    .command('deploy [path]')
    .description('Deploy a project to Scratch Cloud')
    .option('--name <name>', 'Override project name')
    .option('--namespace <namespace>', 'Override namespace')
    .option('--no-build', 'Skip build step')
    .action(async (projectPath: string | undefined, options: { name?: string; namespace?: string; build?: boolean }) => {
      try {
        await deployCommand(projectPath, {
          name: options.name,
          namespace: options.namespace,
          noBuild: options.build === false,
        })
      } catch (error: any) {
        console.error('Deploy failed:', error.message)
        process.exit(1)
      }
    })

  // Projects commands
  const projects = cloud
    .command('projects')
    .description('Manage projects')

  projects
    .command('list', { isDefault: true })
    .description('List all projects')
    .action(async () => {
      try {
        await listProjectsCommand()
      } catch (error: any) {
        console.error('Failed to list projects:', error.message)
        process.exit(1)
      }
    })

  projects
    .command('info <name>')
    .description('Show project details')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(async (name: string, options: { namespace?: string }) => {
      try {
        await projectInfoCommand(name, { namespace: options.namespace })
      } catch (error: any) {
        console.error('Failed to get project info:', error.message)
        process.exit(1)
      }
    })

  projects
    .command('delete <name>')
    .description('Delete a project and all its deploys')
    .option('--namespace <namespace>', 'Specify namespace')
    .action(async (name: string, options: { namespace?: string }) => {
      try {
        await projectDeleteCommand(name, { namespace: options.namespace })
      } catch (error: any) {
        console.error('Failed to delete project:', error.message)
        process.exit(1)
      }
    })
}
