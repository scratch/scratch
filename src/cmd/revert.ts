import path from 'path';
import fs from 'fs/promises';
import readline from 'readline';
import { hasTemplate, materializeTemplate, listTemplateFiles } from '../template';
import { generatePackageJson } from './create';
import log from '../logger';

interface RevertOptions {
  list?: boolean;
  force?: boolean;
}

/**
 * Prompt user for yes/no confirmation.
 * Auto-confirms with default value when not running in a TTY (non-interactive).
 */
async function confirm(question: string, defaultValue: boolean): Promise<boolean> {
  // Auto-confirm when not in a TTY (scripts, tests, piped input)
  if (!process.stdin.isTTY) {
    return defaultValue;
  }

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
 * Revert a file or directory to its template version.
 * Creates new files immediately. For existing files, prompts for confirmation (unless --force).
 */
export async function revertCommand(filePath: string | undefined, options: RevertOptions = {}): Promise<void> {
  const allFiles = listTemplateFiles();

  // List available templates if --list flag is provided
  if (options.list) {
    log.info('Available template files:');
    for (const file of allFiles.sort()) {
      // Skip internal build infrastructure
      if (file.startsWith('_build/')) continue;
      console.log(`  ${file}`);
    }
    // package.json is generated, not templated, but can be reverted
    console.log(`  package.json`);
    return;
  }

  if (!filePath) {
    log.error('Please provide a file or directory path to revert, or use --list to see available templates.');
    process.exit(1);
  }

  // Normalize the path (remove leading ./ and trailing /)
  const templatePath = filePath.replace(/^\.\//, '').replace(/\/$/, '');

  // Special case: package.json is generated, not templated
  if (templatePath === 'package.json') {
    const targetPath = path.resolve(process.cwd(), 'package.json');
    const exists = await fs.exists(targetPath);

    if (exists && !options.force) {
      log.info('The following files will be overwritten:');
      console.log('  package.json');
      const shouldOverwrite = await confirm('Overwrite these files?', true);
      if (!shouldOverwrite) {
        log.info('Skipped 1 existing file.');
        return;
      }
    }

    const projectName = path.basename(process.cwd());
    await generatePackageJson(process.cwd(), projectName);
    log.info(exists ? 'Reverted package.json' : 'Created package.json');
    return;
  }

  // Collect files to revert
  let filesToRevert: string[] = [];

  if (hasTemplate(templatePath)) {
    // Exact file match
    filesToRevert = [templatePath];
  } else {
    // Check if it's a directory (find all templates that start with this path)
    const dirPrefix = templatePath + '/';
    filesToRevert = allFiles.filter(f => f.startsWith(dirPrefix));
  }

  if (filesToRevert.length === 0) {
    log.error(`No template found for: ${templatePath}`);
    console.log(`\nThis command should be run from the project root.`);
    console.log(`Use 'scratch revert --list' to see all available templates.`);
    process.exit(1);
  }

  // Separate into new files and existing files
  const newFiles: string[] = [];
  const existingFiles: string[] = [];

  for (const file of filesToRevert) {
    const targetPath = path.resolve(process.cwd(), file);
    if (await fs.exists(targetPath)) {
      existingFiles.push(file);
    } else {
      newFiles.push(file);
    }
  }

  // Create new files immediately
  for (const file of newFiles) {
    const targetPath = path.resolve(process.cwd(), file);
    await materializeTemplate(file, targetPath);
    log.info(`Created ${file}`);
  }

  // Handle existing files
  if (existingFiles.length > 0) {
    let shouldOverwrite = options.force === true;

    if (!shouldOverwrite) {
      log.info('');
      log.info('The following files will be overwritten:');
      for (const file of existingFiles) {
        console.log(`  ${file}`);
      }
      shouldOverwrite = await confirm('Overwrite these files?', true);
    }

    if (shouldOverwrite) {
      for (const file of existingFiles) {
        const targetPath = path.resolve(process.cwd(), file);
        await materializeTemplate(file, targetPath);
        log.info(`Reverted ${file}`);
      }
    } else {
      log.info(`Skipped ${existingFiles.length} existing file${existingFiles.length === 1 ? '' : 's'}.`);
    }
  }
}
