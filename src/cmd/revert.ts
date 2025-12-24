import path from 'path';
import fs from 'fs/promises';
import { hasTemplate, materializeTemplate, listUserFacingTemplateFiles } from '../template';
import { generatePackageJson } from './create';
import { confirm } from '../util';
import log from '../logger';

interface RevertOptions {
  list?: boolean;
  force?: boolean;
}

/**
 * Revert a file or directory to its template version.
 * Creates new files immediately. For existing files, prompts for confirmation (unless --force).
 */
export async function revertCommand(filePath: string | undefined, options: RevertOptions = {}): Promise<void> {
  const allFiles = listUserFacingTemplateFiles();

  // List available templates if --list flag is provided
  if (options.list) {
    log.info('Available template files:');
    for (const file of allFiles.sort()) {
      log.info(`  ${file}`);
    }
    // package.json is generated, not templated, but can be reverted
    log.info(`  package.json`);
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
    log.info(`Use 'scratch revert --list' to see all available templates.`);
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
        log.info(`  ${file}`);
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
