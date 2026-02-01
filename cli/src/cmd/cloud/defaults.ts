/**
 * Global defaults configuration command.
 *
 * Configures ~/.config/scratch/config.toml with:
 * - server_url: Default server for all projects
 * - visibility: Default visibility for new projects
 */

import log from '../../logger'
import {
  loadGlobalConfig,
  saveGlobalConfig,
  loadCredentials,
  promptServerUrl,
  promptVisibility,
  validateServerUrl,
  normalizeServerUrlInput,
  PATHS,
  type GlobalConfig,
} from '../../config'
import { validateGroupInput } from '@scratch/shared'
import { select, type SelectChoice } from '../../util'

interface DefaultsOptions {
  server?: string
  visibility?: string
}

export async function defaultsCommand(options: DefaultsOptions): Promise<void> {
  // Load existing config
  const existingConfig = await loadGlobalConfig()

  let serverUrl: string
  let visibility: string

  // If both flags provided, skip interactive mode
  if (options.server && options.visibility) {
    // Validate and normalize server URL
    const { url, modified } = normalizeServerUrlInput(options.server)
    const serverError = validateServerUrl(url)
    if (serverError) {
      log.error(serverError)
      process.exit(1)
    }
    serverUrl = url
    if (modified) {
      log.info(`Using ${url}`)
    }

    // Validate visibility
    const visibilityError = validateGroupInput(options.visibility)
    if (visibilityError) {
      log.error(visibilityError)
      process.exit(1)
    }
    visibility = options.visibility
  } else {
    log.info('')
    log.info('Configuring global defaults')
    log.info('')

    // 1. Prompt for server URL
    if (options.server) {
      // Validate and normalize provided server URL
      const { url, modified } = normalizeServerUrlInput(options.server)
      const serverError = validateServerUrl(url)
      if (serverError) {
        log.error(serverError)
        process.exit(1)
      }
      serverUrl = url
      if (modified) {
        log.info(`Using ${url}`)
      }
    } else {
      serverUrl = await promptServerUrlWithDefault(existingConfig.server_url)
    }

    // 2. Prompt for visibility
    if (options.visibility) {
      // Validate provided visibility
      const visibilityError = validateGroupInput(options.visibility)
      if (visibilityError) {
        log.error(visibilityError)
        process.exit(1)
      }
      visibility = options.visibility
    } else {
      // Try to get user email from credentials for the selected server
      const credentials = await loadCredentials()
      const userEmail = credentials[serverUrl]?.user?.email

      visibility = await promptVisibilityWithDefault(userEmail, existingConfig.visibility)
    }
  }

  // Save config
  const newConfig: GlobalConfig = {
    server_url: serverUrl,
    visibility: visibility,
  }
  await saveGlobalConfig(newConfig)

  log.info('')
  log.info(`Global defaults saved to ${PATHS.userConfig}`)
  log.info('')
  log.info(`  server:     ${serverUrl}`)
  log.info(`  visibility: ${visibility}`)
  log.info('')
}

/**
 * Prompt for server URL with existing config as default
 */
async function promptServerUrlWithDefault(currentUrl?: string): Promise<string> {
  const { getLoggedInServers } = await import('../../config')

  const loggedInServers = await getLoggedInServers()

  // Build choices
  const choices: SelectChoice<string>[] = []

  // Current value first (if set)
  if (currentUrl) {
    choices.push({
      name: `${currentUrl} (current)`,
      value: currentUrl,
    })
  }

  // Add logged-in servers (excluding current)
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

  // Use current value as default, otherwise first choice
  const defaultValue = currentUrl || (choices.length > 1 ? choices[0]!.value : '__other__')

  const selected = await select('Server URL:', choices, defaultValue)

  if (selected === '__other__') {
    return promptServerUrl(currentUrl)
  }

  return selected
}

/**
 * Prompt for visibility with existing config as default.
 * If userEmail is provided, includes domain-based option.
 */
async function promptVisibilityWithDefault(
  userEmail: string | undefined,
  currentValue?: string
): Promise<string> {
  // If we have user context, use the full visibility prompt
  if (userEmail) {
    return promptVisibility(userEmail, currentValue)
  }

  // Otherwise, show simplified options without domain
  const defaultValue = currentValue || 'private'

  const choices: SelectChoice<string>[] = [
    { name: 'private (only you)', value: 'private' },
    { name: 'public (anyone with the URL)', value: 'public' },
  ]

  // If current value is custom, show it as an option
  const isCustomVisibility = currentValue &&
    currentValue !== 'private' &&
    currentValue !== 'public'

  if (isCustomVisibility) {
    choices.push({
      name: `${currentValue} (current)`,
      value: currentValue,
    })
  }

  // Always add custom option
  choices.push({
    name: 'Share with specific people...',
    value: '__custom__',
  })

  const selected = await select('Default visibility:', choices, defaultValue)

  if (selected === '__custom__') {
    const { promptCustomVisibility } = await import('../../config')
    return promptCustomVisibility('')
  }

  return selected
}
