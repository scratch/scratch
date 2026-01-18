/**
 * Local project configuration command.
 *
 * Configures .scratch/project.toml with:
 * - server_url: Which server to publish to
 * - name: Project name
 * - visibility: Who can access the project
 */

import path from 'path'
import fs from 'fs/promises'
import log from '../../logger'
import {
  loadProjectConfig,
  saveProjectConfig,
  resolveServerUrl,
  getLoggedInServers,
  promptServerUrl,
  promptProjectName,
  promptVisibility,
  type ProjectConfig,
} from '../../config'
import { CloudContext } from './context'

export async function configCommand(projectPath?: string): Promise<void> {
  const resolvedPath = path.resolve(projectPath || '.')

  // Check if pages/ directory exists (to verify this is a scratch project)
  const pagesDir = path.join(resolvedPath, 'pages')
  let hasPages = false
  try {
    const stat = await fs.stat(pagesDir)
    hasPages = stat.isDirectory()
  } catch {
    hasPages = false
  }

  if (!hasPages) {
    log.error(`No pages/ directory found at ${resolvedPath}`)
    log.error('Run this command from a Scratch project directory.')
    log.error('')
    log.error('To create a new project: scratch create')
    process.exit(1)
  }

  log.info('')
  log.info(`Configuring project: ${resolvedPath}`)
  log.info('')

  // Load existing config
  const existingConfig = await loadProjectConfig(resolvedPath)

  // 1. Prompt for server URL
  const loggedInServers = await getLoggedInServers()
  let serverUrl: string

  if (existingConfig.server_url) {
    // Already configured - show current and ask if they want to change
    log.info(`Current server: ${existingConfig.server_url}`)
    serverUrl = await promptServerUrlWithDefault(existingConfig.server_url, loggedInServers)
  } else if (loggedInServers.length === 0) {
    // Not logged in - prompt for server URL
    serverUrl = await promptServerUrl()
  } else if (loggedInServers.length === 1) {
    // Single server - use it by default
    serverUrl = loggedInServers[0]!
    log.info(`Using server: ${serverUrl}`)
  } else {
    // Multiple servers - prompt to choose
    serverUrl = await resolveServerUrl()
  }

  // Authenticate to get user info for visibility prompt
  const ctx = new CloudContext({ serverUrl })
  const credentials = await ctx.requireAuth()
  const userEmail = credentials.user.email

  // 2. Prompt for project name
  const dirName = path.basename(resolvedPath)
  const projectName = await promptProjectName(existingConfig.name, dirName)

  // 3. Prompt for visibility
  const visibility = await promptVisibility(userEmail, existingConfig.visibility)

  // Save config
  const newConfig: ProjectConfig = {
    name: projectName,
    visibility: visibility,
    server_url: serverUrl,
  }
  await saveProjectConfig(resolvedPath, newConfig)

  log.info('')
  log.info('Project configuration saved to .scratch/project.toml')
  log.info('')
  log.info(`  server:     ${serverUrl}`)
  log.info(`  name:       ${projectName}`)
  log.info(`  visibility: ${visibility}`)
  log.info('')
  log.info('Run `scratch publish` to deploy your project.')
}

/**
 * Prompt for server URL with a default value, also showing logged-in servers
 */
async function promptServerUrlWithDefault(
  currentUrl: string,
  loggedInServers: string[]
): Promise<string> {
  const { select } = await import('../../util')

  type SelectChoice = { name: string; value: string }
  const choices: SelectChoice[] = []

  // Current server first
  choices.push({
    name: `${currentUrl} (current)`,
    value: currentUrl,
  })

  // Add other logged-in servers
  for (const url of loggedInServers) {
    if (url !== currentUrl) {
      choices.push({
        name: url,
        value: url,
      })
    }
  }

  // Add option to enter a different URL
  choices.push({
    name: 'Enter a different server URL...',
    value: '__other__',
  })

  const selected = await select('Server URL:', choices, currentUrl)

  if (selected === '__other__') {
    return promptServerUrl()
  }

  return selected
}
