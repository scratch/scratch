import { materializeTemplates } from '../template';
import log from '../logger';

interface CreateOptions {
  examples?: boolean;
}

/**
 * Create a new Scratch project
 */
export async function createCommand(targetPath: string, options: CreateOptions = {}) {
  let includeExamples = options.examples;

  // If neither flag provided, prompt interactively
  if (includeExamples === undefined) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const response = await new Promise<string>((resolve) => {
      rl.question('Include examples? (Y/n) ', (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
    includeExamples = response !== 'n' && response !== 'no';
  }

  const created = await materializeTemplates('default', targetPath);

  if (includeExamples) {
    const exampleFiles = await materializeTemplates('examples', targetPath);
    created.push(...exampleFiles);
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
