import path from 'path';
import fs from 'fs/promises';
import readline from 'readline';
import { materializeProjectTemplates } from '../template';
import { BUILD_DEPENDENCIES } from '../context';
import log from '../logger';

interface CreateOptions {
  src?: boolean;
  examples?: boolean;
  package?: boolean;
  minimal?: boolean;
  full?: boolean;
}

/**
 * Prompt user for yes/no confirmation.
 */
async function confirm(question: string, defaultValue: boolean): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultValue ? '[Y/n]' : '[y/N]';

  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(defaultValue);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

/**
 * Generate a package.json file for the project.
 */
async function generatePackageJson(targetDir: string, projectName: string): Promise<void> {
  const packageJson = {
    name: projectName,
    private: true,
    scripts: {
      dev: 'scratch dev',
      build: 'scratch build',
    },
    dependencies: Object.fromEntries(
      BUILD_DEPENDENCIES.map(pkg => [pkg, 'latest'])
    ),
  };

  const packageJsonPath = path.join(targetDir, 'package.json');
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

/**
 * Create a new Scratch project.
 * Flag-based with sensible defaults, or interactive prompts if flags not provided.
 *
 * Defaults: --src, --examples, --no-package
 * Shorthands: --minimal (no src, no examples, no package), --full (everything)
 */
export async function createCommand(targetPath: string, options: CreateOptions = {}) {
  // If shorthand flags are used, skip prompts
  const useShorthand = options.minimal || options.full;

  // Only prompt if running interactively (TTY) and flags not explicitly set
  const isInteractive = process.stdin.isTTY;
  const needsExamplesPrompt = isInteractive && !useShorthand && options.examples === undefined;
  const needsSrcPrompt = isInteractive && !useShorthand && options.src === undefined;
  const needsPackagePrompt = isInteractive && !useShorthand && options.package === undefined;

  // Start with defaults
  let includeSrc = true;
  let includeExamples = true;
  let includePackage = false;

  // Apply shorthand flags first
  if (options.minimal) {
    includeSrc = false;
    includeExamples = false;
    includePackage = false;
  }
  if (options.full) {
    includeSrc = true;
    includeExamples = true;
    includePackage = true;
  }

  // Explicit flags override shorthands
  if (options.src !== undefined) includeSrc = options.src;
  if (options.examples !== undefined) includeExamples = options.examples;
  if (options.package !== undefined) includePackage = options.package;

  // Interactive prompts for options not explicitly set
  if (needsExamplesPrompt) {
    log.info('Include pages/examples/?');
    includeExamples = await confirm('Include a set of example pages', true);
    log.info('');
  }

  if (needsSrcPrompt) {
    log.info('Include src/?');
    includeSrc = await confirm('Allows for customizing styles, wrapper and Markdown components', true);
    log.info('');
  }

  if (needsPackagePrompt) {
    log.info('Include package.json?');
    includePackage = await confirm('Allows for adding third-party packages & custom build scripts', false);
    log.info('');
  }

  const created = await materializeProjectTemplates(targetPath, {
    includeSrc,
    includeExamples,
  });

  // Generate package.json if requested
  if (includePackage) {
    const projectName = path.basename(path.resolve(targetPath));
    await generatePackageJson(targetPath, projectName);
    created.push('package.json');
  }

  if (created.length > 0) {
    log.info('Created:');
    for (const file of created.sort()) {
      log.info(`  ${file}`);
    }
    log.info('');
    log.info('Start the development server:');
    if (targetPath !== '.') {
      log.info(`  cd ${targetPath}`);
    }
    log.info('  scratch dev');
  } else {
    log.info('No files created (project already exists)');
  }
}
