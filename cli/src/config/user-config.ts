/**
 * User config utilities.
 *
 * Note: Global config file (~/.config/scratch/config.toml) has been removed.
 * Server selection now uses smart resolution:
 * - Project config (.scratch/project.toml server_url)
 * - Single logged-in server auto-selected
 * - Multiple servers prompts user to choose
 * - Default server URL as fallback
 */

import { DEFAULT_SERVER_URL } from './paths'
import type { UserConfig } from './types'

/**
 * Load user config.
 * @deprecated Global config has been removed. Returns empty object.
 */
export async function loadUserConfig(): Promise<UserConfig> {
  return {}
}

/**
 * Save user config.
 * @deprecated Global config has been removed. This is a no-op.
 */
export async function saveUserConfig(_config: UserConfig): Promise<void> {
  // No-op: global config has been removed
}

/**
 * Get the server URL from environment variable or return default.
 * Note: This no longer reads from global config file.
 */
export async function getServerUrl(): Promise<string> {
  // Environment variable takes precedence
  if (process.env.SCRATCH_SERVER_URL) {
    return process.env.SCRATCH_SERVER_URL
  }

  // Fall back to default
  return DEFAULT_SERVER_URL
}

/**
 * Get the default server URL constant
 */
export function getDefaultServerUrl(): string {
  return DEFAULT_SERVER_URL
}
