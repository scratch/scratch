import { materializeProjectTemplates } from '../template';
import log from '../logger';

interface InitOptions {
  full?: boolean;
  examples?: boolean;
}

/**
 * Initialize a Scratch project.
 * Flag-based, no prompts.
 *
 * Flags:
 * - --full: Include theme.css and components
 * - --examples: Include example pages
 */
export async function initCommand(targetPath: string, options: InitOptions = {}) {
  const created = await materializeProjectTemplates(targetPath, {
    includeComponents: options.full ?? false,
    includeExamples: options.examples ?? false,
  });

  if (created.length > 0) {
    log.info('Initialized:');
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
