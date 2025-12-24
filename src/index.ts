#!/usr/bin/env bun

import { Command } from 'commander';
import fs from 'fs/promises';
import { buildCommand } from './cmd/build';
import { createCommand } from './cmd/create';
import { devCommand } from './cmd/dev';
import { previewCommand } from './cmd/preview';
import { revertCommand } from './cmd/revert';
import { updateCommand } from './cmd/update';
import { getBuildContext, setBuildContext } from './context';
import log, { setLogLevel } from './logger';
import { VERSION } from './version';

const program = new Command();

function withErrorHandling(
  name: string,
  handler: (...args: any[]) => Promise<void>
) {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (error) {
      log.error(`${name} failed:`, error);
      process.exit(1);
    }
  };
}

program
  .name('scratch')
  .description('Scratch, implemented with bun')
  .version(VERSION)
  .option('-v, --verbose', 'Verbose output')
  .option('-q, --quiet', 'Quiet mode (errors only)');

program
  .command('create')
  .description('Create a new Scratch project')
  .argument('[path]', 'Path to project directory', '.')
  .option('--no-src', 'Exclude src/ directory')
  .option('--no-examples', 'Exclude example pages')
  .option('--no-package', 'Exclude package.json')
  .action(
    withErrorHandling('Create', async (path, options) => {
      await createCommand(path, options);
    })
  );

program
  .command('build')
  .argument('[path]', 'Path to project directory', '.')
  .option('-b, --build <path>', 'Build directory')
  .option('-d, --development', 'Development mode')
  .option('--no-ssg', 'Disable static site generation')
  .option('--strict', 'Do not inject PageWrapper component or missing imports')
  .action(
    withErrorHandling('Build', async (path, options) => {
      log.info('Building Scratch project in', path);
      const startTime = Date.now();
      log.debug('Options:', options);
      await buildCommand(options);
      log.info(`Build completed in ${Date.now() - startTime}ms`);
    })
  );

program
  .command('dev')
  .argument('[path]', 'Path to project directory', '.')
  .option('-d, --development', 'Development mode')
  .option('-n, --no-open', 'Do not open dev server endpoint automatically')
  .option('-p, --port <port>', 'Port for dev server', '5173')
  .option('--strict', 'Do not inject PageWrapper component or missing imports')
  .action(
    withErrorHandling('Dev server', async (path, options) => {
      log.info('Starting dev server in', path);
      await devCommand(options);
    })
  );

program
  .command('preview')
  .argument('[path]', 'Path to project directory', '.')
  .option('-n, --no-open', 'Do not open preview server endpoint automatically')
  .option('-p, --port <port>', 'Port for preview server', '4173')
  .action(
    withErrorHandling('Preview server', async (path, options) => {
      log.info('Starting preview server in', path);
      await previewCommand(options);
    })
  );

program
  .command('clean')
  .argument('[path]', 'Path to project directory', '.')
  .action(
    withErrorHandling('Clean', async () => {
      const ctx = getBuildContext();
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
  .command('revert')
  .description('Revert a file to its template version')
  .argument('[file]', 'File to revert')
  .option('-l, --list', 'List available template files')
  .option('-f, --force', 'Overwrite existing files without confirmation')
  .action(
    withErrorHandling('Revert', async (file, options) => {
      await revertCommand(file, options);
    })
  );

program.hook('preAction', (thisCommand, actionCommand) => {
  const globalOpts = program.opts();
  if (globalOpts.verbose) {
    setLogLevel('verbose');
  } else if (globalOpts.quiet) {
    setLogLevel('quiet');
  }
  const opts = actionCommand.opts() || {};
  opts.path = actionCommand.args[0] || '.';
  setBuildContext(opts);
});

program.parse();
