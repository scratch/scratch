#!/usr/bin/env bun

import { Command } from 'commander';
import fs from 'fs/promises';
import { buildCommand } from './cmd/build';
import { createCommand } from './cmd/create';
import { devCommand } from './cmd/dev';
import { previewCommand } from './cmd/preview';
import { checkoutCommand } from './cmd/checkout';
import { updateCommand } from './cmd/update';
import { watchCommand } from './cmd/watch';
import { BuildContext } from './build/context';
import log, { setLogLevel, setShowBunErrors, shouldShowBunErrors } from './logger';
import { VERSION } from './version';
import { formatBytes } from './util';

// Cloud command handlers
import { CloudContext } from './cmd/cloud/context';
import { loginCommand, logoutCommand, whoamiCommand, cfAccessCommand } from './cmd/cloud/auth';
import { publishCommand } from './cmd/cloud/publish';
import { configCommand } from './cmd/cloud/config';
import { listProjectsCommand, projectInfoCommand, projectDeleteCommand } from './cmd/cloud/projects';
import { shareCreateCommand, shareListCommand, shareRevokeCommand } from './cmd/cloud/share';

// Context created in preAction hook, used by commands
let ctx: BuildContext;

const program = new Command();

export function withErrorHandling(
  name: string,
  handler: (...args: any[]) => Promise<void>
) {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (error: any) {
      // By default, just show the error message cleanly
      // With --show-bun-errors, show the full error with stack trace
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
 * Create a CloudContext from optional server URL argument
 */
function createCloudContext(serverUrl?: string, projectPath?: string): CloudContext {
  return new CloudContext({
    serverUrl,
    projectPath,
  });
}

program
  .name('scratch')
  .description('Build static websites with Markdown and React')
  .version(VERSION)
  .option('-v, --verbose', 'Verbose output')
  .option('-q, --quiet', 'Quiet mode (errors only)')
  .option('--show-bun-errors', 'Show full Bun error stack traces')
  .addHelpText('after', `
Command Groups:
  Local:    create, build, dev, preview, watch, clean, update, eject, config
  Server:   login, logout, whoami, cf-access
  Project:  publish, projects
  Share:    share
`);

// =============================================================================
// Local Commands
// =============================================================================

program
  .command('create')
  .description('Create a new Scratch project')
  .argument('[path]', 'Target directory', '.')
  .option('--no-src', 'Skip src/ template directory')
  .option('--no-package', 'Skip package.json template')
  .option('--minimal', 'Minimal mode: skip example content, use simple PageWrapper')
  .action(
    withErrorHandling('Create', async (path, options) => {
      await createCommand(path, options);
    })
  );

program
  .command('build')
  .description('Bundle your project into a static website')
  .argument('[path]', 'Path to project directory', '.')
  .option('-o, --out-dir <path>', 'Output directory (default: dist)')
  .option('-d, --development', 'Development mode')
  .option('-b, --base <path>', 'Base path for deployment (e.g., /mysite/)')
  .option('--test-base', 'Output to dist/<base>/ for local testing')
  .option('--no-ssg', 'Disable static site generation')
  .option('--static <mode>', 'Static file mode: public, assets, all', 'assets')
  .option('--strict', 'Do not inject PageWrapper component or missing imports')
  .option('--highlight <mode>', 'Syntax highlighting: off, popular, auto, all', 'auto')
  .action(
    withErrorHandling('Build', async (path, options) => {
      const startTime = Date.now();
      log.debug('Options:', options);
      const result = await buildCommand(ctx, options, path);
      const elapsed = Date.now() - startTime;
      if (result.fileCount !== undefined && result.totalBytes !== undefined) {
        log.info(`Built ${result.fileCount} files (${formatBytes(result.totalBytes)}) in ${elapsed}ms`);
      } else {
        log.info(`Build completed in ${elapsed}ms`);
      }
    })
  );

program
  .command('dev')
  .description('Start a local development server')
  .argument('[path]', 'Path to project directory', '.')
  .option('-d, --development', 'Development mode')
  .option('-n, --no-open', "Don't open browser automatically")
  .option('-p, --port <port>', 'Port for dev server', '5173')
  .option('-b, --base <path>', 'Base path for deployment (e.g., /mysite/)')
  .option('--static <mode>', 'Static file mode: public, assets, all', 'assets')
  .option('--strict', 'Do not inject PageWrapper component or missing imports')
  .option('--highlight <mode>', 'Syntax highlighting: off, popular, auto, all', 'auto')
  .action(
    withErrorHandling('Dev server', async (path, options) => {
      log.info('Starting dev server in', path);
      await devCommand(ctx, options);
    })
  );

program
  .command('preview')
  .description('Preview production build locally')
  .argument('[path]', 'Path to project directory', '.')
  .option('-n, --no-open', "Don't open browser automatically")
  .option('-p, --port <port>', 'Port for preview server', '4173')
  .action(
    withErrorHandling('Preview server', async (path, options) => {
      log.info('Starting preview server in', path);
      await previewCommand(ctx, options);
    })
  );

program
  .command('watch')
  .description('Serve target file/directory on development server')
  .argument('[path]', 'Markdown file or directory to watch', '.')
  .option('-p, --port <port>', 'Port for dev server', '5173')
  .option('-n, --no-open', "Don't open browser automatically")
  .action(
    withErrorHandling('Watch', async (file, options) => {
      await watchCommand(file, {
        ...options,
        port: options.port ? parseInt(options.port, 10) : undefined,
      });
    })
  );

program
  .command('clean')
  .description('Remove build artifacts')
  .argument('[path]', 'Path to project directory', '.')
  .action(
    withErrorHandling('Clean', async () => {
      await fs.rm(ctx.buildDir, { recursive: true, force: true });
      await fs.rm(ctx.tempDir, { recursive: true, force: true });
      log.info('Cleaned dist/ and .scratch/cache/');
    })
  );

program
  .command('update')
  .description('Update scratch to the latest version')
  .action(
    withErrorHandling('Update', async () => {
      await updateCommand();
    })
  );

program
  .command('eject')
  .description('Eject a file or directory from the built-in templates')
  .argument('[file]', 'File or directory to clone')
  .option('-l, --list', 'List available template files')
  .option('-f, --force', 'Overwrite existing files without confirmation')
  .action(
    withErrorHandling('Pull', async (file, options) => {
      await checkoutCommand(file, options);
    })
  );

program
  .command('config')
  .description('Configure local project settings (.scratch/project.toml)')
  .argument('[path]', 'Path to project directory', '.')
  .action(
    withErrorHandling('Config', async (projectPath) => {
      await configCommand(projectPath);
    })
  );

// =============================================================================
// Server Commands
// =============================================================================

program
  .command('login')
  .description('Log in to a Scratch server')
  .argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')
  .option('--timeout <minutes>', 'Timeout in minutes for login approval (default: 10)')
  .action(
    withErrorHandling('Login', async (serverUrl, options) => {
      const ctx = createCloudContext(serverUrl);
      await loginCommand(ctx, { timeout: options.timeout ? parseFloat(options.timeout) : undefined });
    })
  );

program
  .command('logout')
  .description('Log out from a Scratch server')
  .argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')
  .action(
    withErrorHandling('Logout', async (serverUrl) => {
      const ctx = createCloudContext(serverUrl);
      await logoutCommand(ctx);
    })
  );

program
  .command('whoami')
  .description('Show current logged-in user')
  .argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')
  .action(
    withErrorHandling('Whoami', async (serverUrl) => {
      const ctx = createCloudContext(serverUrl);
      await whoamiCommand(ctx);
    })
  );

program
  .command('cf-access')
  .description('Configure Cloudflare Access service token')
  .argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')
  .action(
    withErrorHandling('CF Access', async (serverUrl) => {
      const ctx = createCloudContext(serverUrl);
      await cfAccessCommand(ctx);
    })
  );

// =============================================================================
// Project Commands
// =============================================================================

program
  .command('publish')
  .description('Build and publish project to a Scratch server')
  .argument('[path]', 'Path to project directory', '.')
  .option('--name <name>', 'Override project name')
  .option('--visibility <visibility>', 'Override visibility (public, private, @domain, or email list)')
  .option('--no-build', 'Skip build step')
  .option('--dry-run', 'Show what would be deployed without uploading')
  .action(
    withErrorHandling('Publish', async (projectPath, options) => {
      const ctx = createCloudContext(undefined, projectPath);
      await publishCommand(ctx, projectPath, {
        name: options.name,
        visibility: options.visibility,
        noBuild: options.build === false,
        dryRun: options.dryRun === true,
      });
    })
  );

// Projects subcommand group
const projects = program
  .command('projects')
  .description('Manage projects on a Scratch server');

projects
  .command('list', { isDefault: true })
  .description('List all projects')
  .argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')
  .action(
    withErrorHandling('Projects list', async (serverUrl) => {
      const ctx = createCloudContext(serverUrl);
      await listProjectsCommand(ctx);
    })
  );

projects
  .command('info')
  .description('Show project details')
  .argument('[name]', 'Project name (uses .scratch/project.toml if not specified)')
  .argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')
  .action(
    withErrorHandling('Projects info', async (name, serverUrl) => {
      const ctx = createCloudContext(serverUrl);
      await projectInfoCommand(ctx, name);
    })
  );

projects
  .command('delete')
  .description('Delete a project and all its deploys')
  .argument('[name]', 'Project name (uses .scratch/project.toml if not specified)')
  .argument('[server-url]', 'Server URL (prompts if logged into multiple servers)')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(
    withErrorHandling('Projects delete', async (name, serverUrl, options) => {
      const ctx = createCloudContext(serverUrl);
      await projectDeleteCommand(ctx, name, { force: options.force });
    })
  );

// =============================================================================
// Share Commands
// =============================================================================

const share = program
  .command('share')
  .description('Create and manage share tokens for anonymous access');

share
  .command('create', { isDefault: true })
  .description('Create a share token')
  .argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')
  .option('--name <name>', 'Token name')
  .option('--duration <duration>', 'Token duration (1d, 1w, 1m)')
  .action(
    withErrorHandling('Share create', async (project, options) => {
      const ctx = createCloudContext();
      await shareCreateCommand(ctx, project, { name: options.name, duration: options.duration });
    })
  );

share
  .command('list')
  .description('List share tokens for a project')
  .argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')
  .action(
    withErrorHandling('Share list', async (project) => {
      const ctx = createCloudContext();
      await shareListCommand(ctx, project);
    })
  );

share
  .command('revoke')
  .description('Revoke a share token')
  .argument('<tokenId>', 'Token ID to revoke')
  .argument('[project]', 'Project name (uses .scratch/project.toml if not specified)')
  .action(
    withErrorHandling('Share revoke', async (tokenId, project) => {
      const ctx = createCloudContext();
      await shareRevokeCommand(ctx, tokenId, project);
    })
  );

// =============================================================================
// Hooks and Entry
// =============================================================================

program.hook('preAction', (thisCommand, actionCommand) => {
  const globalOpts = program.opts();
  if (globalOpts.verbose) {
    setLogLevel('verbose');
  } else if (globalOpts.quiet) {
    setLogLevel('quiet');
  }
  if (globalOpts.showBunErrors) {
    setShowBunErrors(true);
  }
  const opts = actionCommand.opts() || {};
  opts.path = actionCommand.args[0] || '.';

  // Dev command should always run in development mode
  if (actionCommand.name() === 'dev') {
    opts.development = true;
  }

  ctx = new BuildContext(opts);
});

program.parse();
