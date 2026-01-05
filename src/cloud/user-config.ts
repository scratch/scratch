import { mkdir, writeFile, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { homedir } from 'os'

// Config file location following XDG spec
export const CONFIG_PATH = join(homedir(), '.config', 'scratch', 'config.toml')

export interface UserConfig {
  server_url?: string
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
      }
    }
  }

  return config
}

// Generate TOML with comments
function generateTOML(config: UserConfig): string {
  const serverUrl = config.server_url || DEFAULT_SERVER_URL

  return `# Scratch Cloud configuration
#
# This file is managed by 'scratch cloud config'
# You can also edit it manually.

# The Scratch server URL
# Default: ${DEFAULT_SERVER_URL}
server_url = "${serverUrl}"
`
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
