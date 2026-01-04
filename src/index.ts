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

// Context created in preAction hook, used by commands
let ctx: BuildContext;

const program = new Command();

function withErrorHandling(
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

program
  .name('scratch')
  .description('Build static websites with Markdown and React')
  .version(VERSION)
  .option('-v, --verbose', 'Verbose output')
  .option('-q, --quiet', 'Quiet mode (errors only)')
  .option('--show-bun-errors', 'Show full Bun error stack traces');

program
  .command('create')
  .description('Create a new Scratch project')
  .argument('[path]', 'Path to project directory', '.')
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
      await buildCommand(ctx, options, path);
      log.info(`Build completed in ${Date.now() - startTime}ms`);
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
  .aliases(['view'])
  .description('Serve target file/directory on development server')
  .argument('<path>', 'Markdown file or directory to watch')
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
      log.info('Cleaned dist/ and .scratch-build-cache/');
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
  .command('checkout')
  .aliases(['eject'])
  .description('Clone a file or directory from the built-in templates')
  .argument('[file]', 'File or directory to checkout')
  .option('-l, --list', 'List available template files')
  .option('-f, --force', 'Overwrite existing files without confirmation')
  .action(
    withErrorHandling('Checkout', async (file, options) => {
      await checkoutCommand(file, options);
    })
  );

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
