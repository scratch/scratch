import { materializeProjectTemplates } from '../template';
import log from '../logger';

interface InitOptions {
  src?: boolean;
  examples?: boolean;
}

/**
 * Initialize a Scratch project.
 * Flag-based, no prompts.
 *
 * Flags:
 * - --src: Include src/ directory
 * - --examples: Include example pages
 */
export async function initCommand(targetPath: string, options: InitOptions = {}) {
  const created = await materializeProjectTemplates(targetPath, {
    includeSrc: options.src ?? false,
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
