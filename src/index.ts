#!/usr/bin/env bun

import { Command } from 'commander';
import fs from 'fs/promises';
import { buildCommand } from './cmd/build';
import { createCommand } from './cmd/create';
import { initCommand } from './cmd/init';
import { devCommand } from './cmd/dev';
import { previewCommand } from './cmd/preview';
import { getBuildContext, setBuildContext } from './context';
import log, { setLogLevel } from './logger';

const program = new Command();

program
  .name('scratch')
  .description('Scratch, implemented with bun')
  .version('0.1')
  .option('-v, --verbose', 'Verbose output')
  .option('-q, --quiet', 'Quiet mode (errors only)');

program
  .command('init')
  .description('Initialize a Scratch project (flag-based, no prompts)')
  .argument('[path]', 'Path to project directory', '.')
  .option('-f, --full', 'Include theme.css and components')
  .option('-e, --examples', 'Include example files')
  .action(async (path, options) => {
    try {
      await initCommand(path, options);
    } catch (error) {
      log.error('Failed to initialize project:', error);
      process.exit(1);
    }
  });

program
  .command('create')
  .description('Create a new Scratch project (interactive prompts)')
  .argument('[path]', 'Path to project directory', '.')
  .action(async (path) => {
    try {
      await createCommand(path);
    } catch (error) {
      log.error('Failed to create project:', error);
      process.exit(1);
    }
  });

program
  .command('build')
  .argument('[path]', 'Path to project directory', '.')
  .option('-b, --build <path>', 'Build directory')
  .option('-d, --development', 'Development mode')
  .option(
    '-s, --ssg [value]',
    'Static site generation',
    (value) => {
      if (value === undefined) return true; // --flag with no value
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new Error('SSG flag must be true or false');
    },
    true
  )
  .option('--strict', 'Do not inject PageWrapper component or missing imports')
  .action(async (path, options) => {
    try {
      log.info('Building Scratch project in', path);
      const startTime = Date.now();
      log.debug('Options:', options);
      await buildCommand(options);
      log.info(`Build completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      log.error('Build failed:', error);
      process.exit(1);
    }
  });

program
  .command('dev')
  .argument('[path]', 'Path to project directory', '.')
  .option('-d, --development', 'Development mode')
  .option('-n, --no-open', 'Do not open dev server endpoint automatically')
  .option('-p, --port <port>', 'Port for dev server', '5173')
  .option('--strict', 'Do not inject PageWrapper component or missing imports')
  .action(async (path, options) => {
    try {
      log.debug('Starting dev server', path);
      await devCommand(options);
    } catch (error) {
      log.error('Dev server failed:', error);
      process.exit(1);
    }
  });

program
  .command('preview')
  .argument('[path]', 'Path to project directory', '.')
  .option('-n, --no-open', 'Do not open preview server endpoint automatically')
  .option('-p, --port <port>', 'Port for preview server', '4173')
  .action(async (path, options) => {
    try {
      log.debug('Starting preview server', path);
      await previewCommand(options);
    } catch (error) {
      log.error('Preview server failed:', error);
      process.exit(1);
    }
  });

program
  .command('clean')
  .argument('[path]', 'Path to project directory', '.')
  .action(async (path, options) => {
    try {
      const ctx = getBuildContext();
      await fs.rm(ctx.buildDir, { recursive: true, force: true });
      await fs.rm(ctx.tempDir, { recursive: true, force: true });
      log.info('Cleaned dist/ and .scratch-build-cache/');
    } catch (error) {
      log.error('Clean failed:', error);
      process.exit(1);
    }
  });

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
