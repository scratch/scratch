// Cloud command group registration

import { Command } from 'commander';
import { loginCommand, logoutCommand, whoamiCommand } from './auth';
import {
  listProjectsCommand,
  createProjectCommand,
  projectInfoCommand,
  updateProjectCommand,
  linkProjectCommand,
  deleteProjectCommand,
} from './projects';
import { deployCommand } from './deploy';
import { configCommand } from './config';
import {
  listTokensCommand,
  createTokenCommand,
  deleteTokenCommand,
} from './tokens';
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

  cloud
    .command('config')
    .description('Configure Scratch Cloud settings')
    .option('-s, --server <url>', 'Scratch server URL (non-interactive)')
    .action(
      withErrorHandling('Config', async (options) => {
        await configCommand(options);
      })
    );

  // Projects subcommand group
  const projects = cloud
    .command('projects')
    .description('Manage cloud projects');

  projects
    .command('list')
    .alias('ls')
    .description('List projects in your organization')
    .action(withErrorHandling('List projects', listProjectsCommand));

  projects
    .command('create')
    .description('Create a new project')
    .argument('<name>', 'Project name/identifier')
    .option('-D, --display-name <name>', 'Display name (defaults to project name)')
    .option('-d, --description <text>', 'Project description')
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
    .argument('<name>', 'Project name')
    .action(
      withErrorHandling('Project info', async (name) => {
        await projectInfoCommand(name);
      })
    );

  projects
    .command('update')
    .description('Update project settings')
    .argument('<name>', 'Project name')
    .option('-D, --display-name <name>', 'New display name')
    .option('-d, --description <text>', 'New description')
    .option('-a, --access <access>', 'View access: public or authenticated')
    .action(
      withErrorHandling('Update project', async (name, options) => {
        await updateProjectCommand(name, options);
      })
    );

  projects
    .command('link')
    .description('Link current directory to a cloud project')
    .argument('<name>', 'Project name')
    .action(
      withErrorHandling('Link project', async (name) => {
        await linkProjectCommand(name);
      })
    );

  projects
    .command('delete')
    .alias('rm')
    .description('Delete a project')
    .argument('<name>', 'Project name')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(
      withErrorHandling('Delete project', async (name, options) => {
        await deleteProjectCommand(name, options);
      })
    );

  // Deploy command (at cloud level, not under projects)
  cloud
    .command('deploy')
    .description('Build and deploy project to cloud')
    .argument('[path]', 'Path to project directory', '.')
    .option(
      '-p, --project <name>',
      'Project name (defaults to package.json name)'
    )
    .action(
      withErrorHandling('Deploy', async (path, options) => {
        await deployCommand(path, options);
      })
    );

  // Tokens subcommand group
  const tokens = cloud
    .command('tokens')
    .description('Manage API tokens');

  tokens
    .command('list')
    .alias('ls')
    .description('List all API tokens')
    .action(withErrorHandling('List tokens', listTokensCommand));

  tokens
    .command('create')
    .description('Create a new API token')
    .option('-n, --name <name>', 'Token name for identification')
    .option('-e, --expires <days>', 'Days until expiration (default: never)', parseInt)
    .action(
      withErrorHandling('Create token', async (options) => {
        await createTokenCommand(options);
      })
    );

  tokens
    .command('delete <id>')
    .alias('rm')
    .description('Delete an API token')
    .action(
      withErrorHandling('Delete token', async (id) => {
        await deleteTokenCommand(id);
      })
    );
}
