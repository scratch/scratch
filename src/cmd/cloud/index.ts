// Cloud command group registration

import { Command } from 'commander';
import { loginCommand, logoutCommand, whoamiCommand } from './auth';
import {
  listProjectsCommand,
  createProjectCommand,
  projectInfoCommand,
  updateProjectCommand,
} from './projects';
import { deployCommand } from './deploy';
import log from '../../logger';
import { shouldShowBunErrors } from '../../logger';

/**
 * Error handling wrapper for cloud commands
 */
function withErrorHandling(
  name: string,
  handler: (...args: any[]) => Promise<void>
) {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (error: any) {
      if (shouldShowBunErrors()) {
        log.error(`${name} failed:`, error);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`${name} failed: ${message}`);
      }
      process.exit(1);
    }
  };
}

/**
 * Register all cloud commands
 */
export function registerCloudCommands(program: Command): void {
  const cloud = program
    .command('cloud')
    .description('Interact with Scratch Cloud');

  // Authentication commands
  cloud
    .command('login')
    .description('Log in to Scratch Cloud')
    .action(withErrorHandling('Login', loginCommand));

  cloud
    .command('logout')
    .description('Log out of Scratch Cloud')
    .action(withErrorHandling('Logout', logoutCommand));

  cloud
    .command('whoami')
    .description('Show current user')
    .action(withErrorHandling('Whoami', whoamiCommand));

  // Projects subcommand group
  const projects = cloud
    .command('projects')
    .description('Manage cloud projects');

  projects
    .command('list')
    .description('List projects in your organization')
    .action(withErrorHandling('List projects', listProjectsCommand));

  projects
    .command('create')
    .description('Create a new project')
    .argument('<name>', 'Project name')
    .option('-s, --slug <slug>', 'Project slug (defaults to name)')
    .option(
      '-a, --access <access>',
      'View access: public or authenticated',
      'public'
    )
    .action(
      withErrorHandling('Create project', async (name, options) => {
        await createProjectCommand(name, options);
      })
    );

  projects
    .command('info')
    .description('Get project details')
    .argument('<project>', 'Project slug')
    .action(
      withErrorHandling('Project info', async (project) => {
        await projectInfoCommand(project);
      })
    );

  projects
    .command('update')
    .description('Update project settings')
    .argument('<project>', 'Project slug')
    .option('-n, --name <name>', 'New project name')
    .option('-a, --access <access>', 'View access: public or authenticated')
    .action(
      withErrorHandling('Update project', async (project, options) => {
        await updateProjectCommand(project, options);
      })
    );

  // Deploy command (at cloud level, not under projects)
  cloud
    .command('deploy')
    .description('Build and deploy project to cloud')
    .argument('[path]', 'Path to project directory', '.')
    .option(
      '-p, --project <slug>',
      'Project slug (defaults to package.json name)'
    )
    .action(
      withErrorHandling('Deploy', async (path, options) => {
        await deployCommand(path, options);
      })
    );
}
