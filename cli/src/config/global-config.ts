import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { parse as parseToml } from 'smol-toml'
import { PATHS } from './paths'
import { escapeTomlString } from './toml'
import type { GlobalConfig } from './types'

const GLOBAL_CONFIG_HEADER = [
  '# Scratch Global Configuration',
  '#',
  '# Default settings that apply to all projects.',
  '# Run `scratch set-defaults` to update these settings interactively.',
]

/**
 * Load global config from ~/.config/scratch/config.toml
 * Returns empty object if file doesn't exist
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  try {
    const content = await readFile(PATHS.userConfig, 'utf-8')
    const parsed = parseToml(content) as {
      server_url?: string
      visibility?: string
    }

    return {
      server_url: parsed.server_url,
      visibility: parsed.visibility,
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {}
    }
    throw err
  }
}

/**
 * Save global config to ~/.config/scratch/config.toml
 */
export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  // Ensure config directory exists
  await mkdir(dirname(PATHS.userConfig), { recursive: true })

  // Generate TOML content with comments
  const lines = [...GLOBAL_CONFIG_HEADER, '']

  if (config.server_url) {
    lines.push(
      '# Default server URL',
      `server_url = "${escapeTomlString(config.server_url)}"`,
      ''
    )
  }

  if (config.visibility) {
    lines.push(
      '# Default visibility for new projects',
      `visibility = "${escapeTomlString(config.visibility)}"`,
      ''
    )
  }

  const content = lines.join('\n')
  await writeFile(PATHS.userConfig, content, 'utf-8')
}
