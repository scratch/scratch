// User configuration storage (~/.scratch/config.toml)

import fs from 'fs/promises';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { parse, stringify } from 'smol-toml';

export interface UserConfig {
  serverUrl?: string;
}

/**
 * Get the path to the user config file
 */
export function getConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/';
  return `${home}/.scratch/config.toml`;
}

/**
 * Get user config (async)
 */
export async function getUserConfig(): Promise<UserConfig | null> {
  try {
    const configPath = getConfigPath();
    const content = await fs.readFile(configPath, 'utf-8');
    return parse(content) as UserConfig;
  } catch {
    return null;
  }
}

/**
 * Get user config (sync) - used for static config initialization
 */
export function getUserConfigSync(): UserConfig | null {
  try {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }
    const content = readFileSync(configPath, 'utf-8');
    return parse(content) as UserConfig;
  } catch {
    return null;
  }
}

/**
 * Save user config to ~/.scratch/config.toml
 */
export async function saveUserConfig(config: UserConfig): Promise<void> {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, stringify(config) + '\n', {
    mode: 0o600, // User read/write only
  });
}
