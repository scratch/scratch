import { mkdir, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { parse as parseToml } from 'smol-toml'
import { PATHS } from './paths'
import { escapeTomlString } from './toml'
import type { ProjectConfig } from './types'

const PROJECT_CONFIG_HEADER = [
  '# Scratch Cloud Project Configuration',
  '#',
  '# This file configures how your project deploys to Scratch Cloud.',
  '# Run `scratch cloud config` to update these settings interactively.',
]

/**
 * Load project config from .scratch/project.toml
 * Returns empty object if file doesn't exist
 */
export async function loadProjectConfig(projectPath: string): Promise<ProjectConfig> {
  const configPath = join(projectPath, PATHS.projectConfig)

  try {
    const content = await readFile(configPath, 'utf-8')
    const parsed = parseToml(content) as {
      name?: string
      server_url?: string
      visibility?: string
    }

    return {
      name: parsed.name,
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
 * Save project config to .scratch/project.toml
 */
export async function saveProjectConfig(projectPath: string, config: ProjectConfig): Promise<void> {
  const scratchDir = join(projectPath, '.scratch')
  const configPath = join(scratchDir, 'project.toml')

  // Ensure .scratch directory exists
  await mkdir(scratchDir, { recursive: true })

  // Generate TOML content with comments
  const lines = [...PROJECT_CONFIG_HEADER, '']

  if (config.name) {
    lines.push('# Project name', `name = "${escapeTomlString(config.name)}"`, '')
  }

  if (config.server_url) {
    lines.push(
      '# Server URL (overrides global default)',
      `server_url = "${escapeTomlString(config.server_url)}"`,
      ''
    )
  }

  if (config.visibility) {
    lines.push('# Visibility', `visibility = "${escapeTomlString(config.visibility)}"`, '')
  }

  const content = lines.join('\n')
  await writeFile(configPath, content, 'utf-8')
}
