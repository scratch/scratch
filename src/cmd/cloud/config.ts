// Cloud config command

import readline from 'readline';
import log from '../../logger';
import { saveUserConfig, getUserConfig, getConfigPath } from '../../cloud/userConfig';

const DEFAULT_SERVER_URL = 'scratch.dev';

/**
 * Prompt for text input with a default value
 */
async function prompt(question: string, defaultValue: string): Promise<string> {
  // Use default when not in a TTY (scripts, tests, piped input)
  if (!process.stdin.isTTY) {
    return defaultValue;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} [${defaultValue}]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed === '' ? defaultValue : trimmed);
    });
  });
}

/**
 * Normalize server URL - ensure https:// prefix
 */
function normalizeServerUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

export interface ConfigOptions {
  server?: string;
}

/**
 * Config command - configure Scratch Cloud settings
 */
export async function configCommand(options: ConfigOptions = {}): Promise<void> {
  log.info('Scratch Cloud Setup\n');

  let serverUrl: string;

  if (options.server) {
    // Non-interactive mode: use provided value
    serverUrl = normalizeServerUrl(options.server);
  } else {
    // Interactive mode: prompt for value
    const currentConfig = await getUserConfig();
    const currentUrl = currentConfig?.serverUrl;

    const defaultUrl = currentUrl
      ? currentUrl.replace(/^https?:\/\//, '')
      : DEFAULT_SERVER_URL;

    const serverUrlInput = await prompt('Scratch server URL?', defaultUrl);
    serverUrl = normalizeServerUrl(serverUrlInput);
  }

  // Save config
  await saveUserConfig({ serverUrl });

  log.info(`\nConfiguration saved to ${getConfigPath()}`);
  log.info(`Server URL: ${serverUrl}`);
}
