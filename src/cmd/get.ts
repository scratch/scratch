import path from 'path';
import fs from 'fs/promises';
import { hasTemplate, materializeTemplate, listUserFacingTemplateFiles } from '../template';
import { generatePackageJson } from './create';
import { confirm, formatFileTree } from '../util';
import log from '../logger';

interface GetOptions {
  list?: boolean;
  force?: boolean;
}

/**
 * Get a file or directory from the templates.
 * Creates new files immediately. For existing files, prompts for confirmation (unless --force).
 */
export async function getCommand(filePath: string | undefined, options: GetOptions = {}): Promise<void> {
  const allFiles = listUserFacingTemplateFiles();

  // List available templates if --list flag is provided
  if (options.list) {
    log.info('Available template files:\n');
    const filesWithPackageJson = [...allFiles, 'package.json'];
    for (const line of formatFileTree(filesWithPackageJson)) {
      log.info(`  ${line}`);
    }
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
      log.info('  package.json');
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
    log.info(`This command should be run from the project root.`);
    log.info(`Use 'scratch get --list' to see all available templates.`);
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
  if (newFiles.length > 0) {
    for (const file of newFiles) {
      const targetPath = path.resolve(process.cwd(), file);
      await materializeTemplate(file, targetPath);
    }
    log.info('Created:\n');
    for (const line of formatFileTree(newFiles)) {
      log.info(`  ${line}`);
    }
  }

  // Handle existing files
  if (existingFiles.length > 0) {
    let shouldOverwrite = options.force === true;

    if (!shouldOverwrite) {
      if (newFiles.length > 0) {
        log.info('');
      }
      log.info('The following files will be overwritten:\n');
      for (const line of formatFileTree(existingFiles)) {
        log.info(`  ${line}`);
      }
      log.info('');
      shouldOverwrite = await confirm('Overwrite these files?', true);
    }

    if (shouldOverwrite) {
      for (const file of existingFiles) {
        const targetPath = path.resolve(process.cwd(), file);
        await materializeTemplate(file, targetPath);
      }
      if (newFiles.length > 0) {
        log.info('');
      }
      log.info('Restored:\n');
      for (const line of formatFileTree(existingFiles)) {
        log.info(`  ${line}`);
      }
    } else {
      log.info(`Skipped ${existingFiles.length} existing file${existingFiles.length === 1 ? '' : 's'}.`);
    }
  }
}
