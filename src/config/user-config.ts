import { mkdir, writeFile, readFile } from 'fs/promises'
import { dirname } from 'path'
import { PATHS, DEFAULT_SERVER_URL } from './paths'
import { parseTOML, generateTOML } from './toml'
import type { UserConfig } from './types'

const USER_CONFIG_KEYS: (keyof UserConfig)[] = ['server_url', 'namespace']

const USER_CONFIG_HEADER = [
  '# Scratch Cloud Global Configuration',
  '#',
  '# These are your default settings for all Scratch projects.',
  '# Run `scratch cloud config` from a non-project directory to update.',
  '# Project-specific settings in .scratch/project.toml override these.',
]

/**
 * Load user config from ~/.config/scratch/config.toml
 * Returns empty object if file doesn't exist or is invalid
 */
export async function loadUserConfig(): Promise<UserConfig> {
  try {
    const content = await readFile(PATHS.userConfig, 'utf-8')
    return parseTOML<UserConfig>(content, USER_CONFIG_KEYS)
  } catch {
    return {}
  }
}

/**
 * Save user config to ~/.config/scratch/config.toml
 * Permissions: 0o644 (world-readable, as this contains no secrets)
 */
export async function saveUserConfig(config: UserConfig): Promise<void> {
  await mkdir(dirname(PATHS.userConfig), { recursive: true })

  const fields = [
    {
      key: 'server_url',
      value: config.server_url || DEFAULT_SERVER_URL,
      comment: 'Default server URL',
    },
  ]

  if (config.namespace) {
    fields.push({
      key: 'namespace',
      value: config.namespace,
      comment: 'Default namespace for new projects',
    })
  }

  const content = generateTOML(fields, USER_CONFIG_HEADER)
  await writeFile(PATHS.userConfig, content, { mode: 0o644 })
}

/**
 * Get the server URL, checking environment variable first, then config, then default
 */
export async function getServerUrl(): Promise<string> {
  // Environment variable takes precedence
  if (process.env.SCRATCH_SERVER_URL) {
    return process.env.SCRATCH_SERVER_URL
  }

  // Then check user config
  const config = await loadUserConfig()
  if (config.server_url) {
    return config.server_url
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
