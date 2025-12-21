import { materializeProjectTemplates } from '../template';
import log from '../logger';

/**
 * Prompt user with a yes/no question.
 * Returns true for yes (default), false for no.
 */
async function promptYesNo(question: string): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const response = await new Promise<string>((resolve) => {
    rl.question(`${question} (Y/n) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
  return response !== 'n' && response !== 'no';
}

/**
 * Create a new Scratch project.
 * Always prompts interactively for options.
 */
export async function createCommand(targetPath: string) {
  const includeComponents = await promptYesNo('Include theme.css, PageWrapper.jsx, and Markdown components?');
  const includeExamples = await promptYesNo('Include examples?');

  const created = await materializeProjectTemplates(targetPath, {
    includeComponents,
    includeExamples,
  });

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
