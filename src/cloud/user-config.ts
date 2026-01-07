import { mkdir, writeFile, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { homedir } from 'os'

// Config file location following XDG spec
export const CONFIG_PATH = join(homedir(), '.config', 'scratch', 'config.toml')

export interface UserConfig {
  server_url?: string
  namespace?: string  // default namespace for new projects
  cf_access_client_id?: string  // Cloudflare Access Client ID
  cf_access_client_secret?: string  // Cloudflare Access Client Secret
}

const DEFAULT_SERVER_URL = 'https://app.scratch.dev'

// Simple TOML parser for our config format
function parseTOML(content: string): UserConfig {
  const config: UserConfig = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^(\w+)\s*=\s*"(.*)"\s*$/)
    if (match) {
      const [, key, value] = match
      if (key === 'server_url') {
        config.server_url = value
      } else if (key === 'namespace') {
        config.namespace = value
      } else if (key === 'cf_access_client_id') {
        config.cf_access_client_id = value
      } else if (key === 'cf_access_client_secret') {
        config.cf_access_client_secret = value
      }
    }
  }

  return config
}

// Escape string for TOML (handle quotes and backslashes)
function escapeTomlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// Generate TOML with comments
function generateTOML(config: UserConfig): string {
  const lines = [
    '# Scratch Cloud Global Configuration',
    '#',
    '# These are your default settings for all Scratch projects.',
    '# Run `scratch cloud config` from a non-project directory to update.',
    '# Project-specific settings in .scratch/project.toml override these.',
    '',
    '# Default server URL',
    `server_url = "${escapeTomlString(config.server_url || DEFAULT_SERVER_URL)}"`,
  ]

  if (config.namespace) {
    lines.push('', '# Default namespace for new projects', `namespace = "${escapeTomlString(config.namespace)}"`)
  }

  if (config.cf_access_client_id && config.cf_access_client_secret) {
    lines.push(
      '',
      '# Cloudflare Access service token',
      `cf_access_client_id = "${escapeTomlString(config.cf_access_client_id)}"`,
      `cf_access_client_secret = "${escapeTomlString(config.cf_access_client_secret)}"`
    )
  }

  return lines.join('\n') + '\n'
}

export async function loadUserConfig(): Promise<UserConfig> {
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8')
    return parseTOML(content)
  } catch {
    return {}
  }
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true })
  await writeFile(CONFIG_PATH, generateTOML(config), { mode: 0o644 })
}

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

export function getDefaultServerUrl(): string {
  return DEFAULT_SERVER_URL
}
