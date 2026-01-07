import log from '../../logger'
import path from 'path'
import fs from 'fs/promises'
import { initiateDeviceFlow, pollDeviceToken, getCurrentUser } from '../../cloud/api'
import { saveCredentials, loadCredentials, clearCredentials, requireAuth } from '../../cloud/credentials'
import { getServerUrl } from '../../cloud/config'
import {
  loadUserConfig,
  saveUserConfig,
  getDefaultServerUrl,
  CONFIG_PATH,
  type UserConfig,
} from '../../cloud/user-config'
import { loadProjectConfig, saveProjectConfig, type ProjectConfig } from './deploy'
import { normalizeNamespace, GLOBAL_NAMESPACE } from './namespace'
import {
  validateProjectName,
  validateNamespaceForUser,
  getEmailDomain,
} from '../../shared/project'
import { validateGroupInput } from '../../shared/group'
import { prompt, select, confirm, openBrowser, type SelectChoice } from '../../util'

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Format connection errors with helpful messages
function formatConnectionError(error: any, serverUrl: string): Error {
  const isConnectionError = error.code === 'ConnectionRefused' ||
    error.code === 'ECONNREFUSED' ||
    error.message?.includes('Unable to connect') ||
    error.message?.includes('fetch failed')

  if (isConnectionError) {
    return new Error(
      `Could not connect to ${serverUrl}\n` +
      `  Error: ${error.message}\n` +
      `  \n` +
      `  Troubleshooting:\n` +
      `  - Is the server running?\n` +
      `  - Check the URL with: scratch cloud config\n` +
      `  - For local dev, try http://localhost:8788 instead of http://app.localhost:8788`
    )
  }

  return error
}

export async function loginCommand(): Promise<void> {
  // Get configured server URL
  const serverUrl = await getServerUrl()

  // Check if already logged in by verifying token with server
  const existing = await loadCredentials()
  if (existing) {
    log.debug('Found existing credentials, verifying...')
    try {
      const { user } = await getCurrentUser(existing.token)
      log.info(`Already logged in as ${user.email}`)
      log.info('Use "scratch cloud logout" to log out first')
      return
    } catch (error: any) {
      if (error.status === 401) {
        // Token expired/invalid, clear and proceed with login
        await clearCredentials()
        log.info('Session expired, logging in again...')
      } else {
        throw formatConnectionError(error, serverUrl)
      }
    }
  }

  log.info(`Logging in to ${serverUrl}`)
  log.debug(`Connecting to ${serverUrl}/auth/device`)

  // Initiate device flow
  let deviceFlowResponse
  try {
    deviceFlowResponse = await initiateDeviceFlow()
  } catch (error: any) {
    throw formatConnectionError(error, serverUrl)
  }

  const { device_code, user_code, verification_url, interval, expires_in } = deviceFlowResponse

  // Display code and open browser
  log.info('')
  log.info('Your verification code is:')
  log.info('')
  log.info(`    ${user_code}`)
  log.info('')
  log.info('Opening browser to complete authentication...')
  log.info(`(If browser doesn't open, visit: ${verification_url})`)
  log.info('')

  await openBrowser(verification_url)

  // Poll for approval
  log.info('Waiting for approval...')

  const startTime = Date.now()
  const timeout = (expires_in || 600) * 1000 // Use server value, default 10 min
  let pollCount = 0

  while (Date.now() - startTime < timeout) {
    await sleep(interval * 1000)
    pollCount++

    log.debug(`Polling for approval (attempt ${pollCount})...`)

    let response
    try {
      response = await pollDeviceToken(device_code)
    } catch (error: any) {
      throw formatConnectionError(error, serverUrl)
    }

    log.debug(`Poll response: ${response.status}`)

    if (response.status === 'approved' && response.token && response.user) {
      // Save credentials
      await saveCredentials({
        token: response.token,
        user: response.user,
        server: serverUrl,
      })

      log.info('')
      log.info(`Logged in as ${response.user.email}`)
      return
    }

    if (response.status === 'denied') {
      log.info('')
      log.error('Login denied')
      process.exit(1)
    }

    if (response.status === 'expired') {
      log.info('')
      log.error('Login expired. Please try again.')
      process.exit(1)
    }

    // Still pending, continue polling
  }

  log.error('Login timed out. Please try again.')
  process.exit(1)
}

export async function logoutCommand(): Promise<void> {
  const credentials = await loadCredentials()

  if (!credentials) {
    log.info('Not logged in')
    return
  }

  await clearCredentials()
  log.info('Logged out')
}

export async function whoamiCommand(): Promise<void> {
  const credentials = await loadCredentials()

  if (!credentials) {
    log.info('Not logged in')
    return
  }

  try {
    // Verify token is still valid by calling /api/me
    const { user } = await getCurrentUser(credentials.token)

    log.info(`Email: ${user.email}`)
    if (user.name) {
      log.info(`Name:  ${user.name}`)
    }
    log.info(`Server: ${credentials.server}`)
  } catch (error: any) {
    if (error.status === 401) {
      log.error('Session expired. Please log in again.')
      await clearCredentials()
      process.exit(1)
    }
    throw error
  }
}

// Derive pages URL from server URL
function getPagesUrl(serverUrl: string): string {
  try {
    const url = new URL(serverUrl)

    // Local dev: different ports (app=8788, pages=8787)
    if (url.hostname === 'localhost' && url.port === '8788') {
      url.port = '8787'
      return url.origin
    }

    // Production: different subdomains (app.* -> pages.*)
    if (url.hostname.startsWith('app.')) {
      url.hostname = url.hostname.replace('app.', 'pages.')
    } else {
      url.hostname = 'pages.' + url.hostname
    }
    return url.origin
  } catch {
    return serverUrl
  }
}

// Validate server URL
function validateServerUrl(url: string): string | null {
  try {
    new URL(url)
  } catch {
    return `Invalid URL: ${url}`
  }

  // Enforce HTTPS for non-localhost URLs
  if (!url.startsWith('https://') && !url.includes('localhost')) {
    return 'Server URL must use HTTPS (except for localhost)'
  }

  return null
}

// Prompt for server URL with validation
async function promptServerUrl(currentValue: string, defaultUrl: string): Promise<string> {
  while (true) {
    let answer = await prompt('Server URL', currentValue || defaultUrl)

    // Add https:// if no protocol specified, but preserve http:// for localhost
    if (!answer.startsWith('http://') && !answer.startsWith('https://')) {
      answer = `https://${answer}`
    }

    const error = validateServerUrl(answer)
    if (error) {
      log.error(error)
      continue
    }

    return answer
  }
}

// Prompt for namespace selection
async function promptNamespace(
  userEmail: string,
  currentValue: string | undefined,
  globalDefault: string | undefined
): Promise<string> {
  const userDomain = getEmailDomain(userEmail)
  const defaultValue = currentValue || globalDefault || GLOBAL_NAMESPACE

  const choices: SelectChoice<string>[] = []

  // User's domain first (if available)
  if (userDomain) {
    choices.push({
      name: `${userDomain} (your domain)`,
      value: userDomain,
    })
  }

  // Global namespace
  choices.push({
    name: 'global (shared namespace)',
    value: GLOBAL_NAMESPACE,
  })

  return select('Namespace:', choices, defaultValue)
}

// Prompt for visibility selection
async function promptVisibility(
  userEmail: string,
  currentValue: string | undefined
): Promise<string> {
  const userDomain = getEmailDomain(userEmail)
  const defaultValue = currentValue || 'private'

  // Build choices
  const choices: SelectChoice<string>[] = [
    { name: 'private (only you)', value: 'private' },
    { name: 'public (anyone with the URL)', value: 'public' },
  ]

  // Add domain option if user has one
  if (userDomain) {
    choices.push({
      name: `@${userDomain} (anyone at ${userDomain})`,
      value: `@${userDomain}`,
    })
  }

  // If current value is custom (not private, public, or domain), show it as an option
  const isCustomVisibility = currentValue &&
    currentValue !== 'private' &&
    currentValue !== 'public' &&
    currentValue !== `@${userDomain}`

  if (isCustomVisibility) {
    choices.push({
      name: `${currentValue} (current)`,
      value: currentValue,
    })
  }

  // Always add "custom" option
  choices.push({
    name: 'Share with specific people...',
    value: '__custom__',
  })

  const selected = await select('Visibility:', choices, defaultValue)

  // Handle custom visibility selection
  if (selected === '__custom__') {
    return promptCustomVisibility('')
  }

  // Handle editing current custom visibility
  if (selected === currentValue && isCustomVisibility) {
    const edit = await confirm('Edit current visibility?', true)
    if (edit) {
      return promptCustomVisibility(currentValue)
    }
  }

  return selected
}

// Prompt for custom visibility (comma-separated emails/@domains)
async function promptCustomVisibility(currentValue: string): Promise<string> {
  while (true) {
    const answer = await prompt('Enter emails and/or @domains (comma-separated)', currentValue)

    if (!answer) {
      log.error('Visibility is required')
      continue
    }

    const error = validateGroupInput(answer)
    if (error) {
      log.error(error)
      continue
    }

    return answer
  }
}

export async function configCommand(projectPath?: string): Promise<void> {
  // Resolve path to absolute
  const resolvedPath = path.resolve(projectPath || '.')

  // Check if pages/ directory exists
  const pagesDir = path.join(resolvedPath, 'pages')
  let hasPages = false
  try {
    const stat = await fs.stat(pagesDir)
    hasPages = stat.isDirectory()
  } catch {
    hasPages = false
  }

  // Load existing configs
  let globalConfig = await loadUserConfig()
  const defaultUrl = getDefaultServerUrl()

  // 1. First, prompt for server URL
  log.info('')
  if (!hasPages) {
    log.info(`No pages/ directory found at ${resolvedPath}`)
    log.info('Configuring global Scratch Cloud settings.')
  } else {
    log.info(`Configuring project: ${resolvedPath}`)
  }
  log.info('')

  const serverUrl = await promptServerUrl(globalConfig.server_url || '', defaultUrl)

  // Save server URL immediately so login uses it
  globalConfig.server_url = serverUrl
  await saveUserConfig(globalConfig)

  // 2. Then, require authentication
  const credentials = await requireAuth()
  const userEmail = credentials.user.email

  // Reload config in case login modified it
  globalConfig = await loadUserConfig()

  if (!hasPages) {
    // Global config flow (just namespace now, server URL already done)
    await runGlobalConfigFlow(resolvedPath, globalConfig, userEmail)
  } else {
    // Project config flow
    await runProjectConfigFlow(resolvedPath, globalConfig, serverUrl, userEmail)
  }
}

export async function configUserCommand(): Promise<void> {
  // Load existing config
  let globalConfig = await loadUserConfig()
  const defaultUrl = getDefaultServerUrl()

  log.info('')
  log.info('Configuring global Scratch Cloud settings.')
  log.info('')

  // 1. First, prompt for server URL
  const serverUrl = await promptServerUrl(globalConfig.server_url || '', defaultUrl)

  // Save server URL immediately so login uses it
  globalConfig.server_url = serverUrl
  await saveUserConfig(globalConfig)

  // 2. Then, require authentication
  const credentials = await requireAuth()
  const userEmail = credentials.user.email

  // Reload config in case login modified it
  globalConfig = await loadUserConfig()

  // 3. Continue with rest of global config
  await runGlobalConfigFlow('.', globalConfig, userEmail)
}

async function runGlobalConfigFlow(
  resolvedPath: string,
  globalConfig: UserConfig,
  userEmail: string
): Promise<void> {
  // Prompt for default namespace
  const namespace = await promptNamespace(userEmail, globalConfig.namespace, GLOBAL_NAMESPACE)

  // Save global config (preserve existing server_url)
  const newConfig: UserConfig = {
    ...globalConfig,
    namespace: namespace !== GLOBAL_NAMESPACE ? namespace : undefined,
  }
  await saveUserConfig(newConfig)

  log.info('')
  log.info(`Global configuration saved to ${CONFIG_PATH}`)
}

export async function cfAccessCommand(): Promise<void> {
  const globalConfig = await loadUserConfig()

  log.info('')
  log.info('Configure Cloudflare Access service token')
  log.info('Get these values from Cloudflare Zero Trust dashboard:')
  log.info('Access → Service Auth → Service Tokens')
  log.info('')

  const clientId = await prompt('Client ID', globalConfig.cf_access_client_id || '')
  if (!clientId) {
    throw new Error('Client ID is required')
  }

  const clientSecret = await prompt('Client Secret', globalConfig.cf_access_client_secret || '')
  if (!clientSecret) {
    throw new Error('Client Secret is required')
  }

  globalConfig.cf_access_client_id = clientId
  globalConfig.cf_access_client_secret = clientSecret
  await saveUserConfig(globalConfig)

  log.info('')
  log.info('Cloudflare Access credentials saved to global configuration')
}

async function runProjectConfigFlow(
  resolvedPath: string,
  globalConfig: UserConfig,
  serverUrl: string,
  userEmail: string
): Promise<void> {
  const projectConfig = await loadProjectConfig(resolvedPath)
  const dirName = path.basename(resolvedPath)

  // 1. Project name
  const defaultName = projectConfig.name || dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
  let projectName: string

  while (true) {
    projectName = await prompt('Project name', defaultName)

    if (!projectName) {
      log.error('Project name is required')
      continue
    }

    const nameValidation = validateProjectName(projectName)
    if (!nameValidation.valid) {
      log.error(nameValidation.error || 'Invalid project name')
      continue
    }

    break
  }

  // 2. Namespace
  const namespace = await promptNamespace(
    userEmail,
    projectConfig.namespace,
    globalConfig.namespace
  )

  // Validate namespace for user
  const nsValidation = validateNamespaceForUser(namespace, userEmail)
  if (!nsValidation.valid) {
    log.error(nsValidation.error || 'Invalid namespace')
    process.exit(1)
  }

  // 3. Visibility
  const visibility = await promptVisibility(userEmail, projectConfig.visibility)

  // Save project config (don't store server_url if it matches global)
  const newProjectConfig: ProjectConfig = {
    name: projectName,
    namespace: namespace,
    server_url: serverUrl !== globalConfig.server_url ? serverUrl : undefined,
    visibility: visibility,
  }
  await saveProjectConfig(resolvedPath, newProjectConfig)

  // Show project URL
  const pagesUrl = getPagesUrl(serverUrl)
  const urlNamespace = namespace === GLOBAL_NAMESPACE ? '_' : namespace

  log.info('')
  log.info('Project configuration saved to .scratch/project.toml')
  log.info('')
  log.info('Your project URL will be:')
  log.info(`  ${pagesUrl}/${urlNamespace}/${projectName}/`)
  log.info('')

  // Offer to update global namespace default
  if (namespace !== GLOBAL_NAMESPACE && globalConfig.namespace !== namespace) {
    const updateNs = await confirm(`Set ${namespace} as your default namespace for new projects?`, false)
    if (updateNs) {
      globalConfig.namespace = namespace
      await saveUserConfig(globalConfig)
      log.info('')
      log.info('Global configuration updated.')
    }
  }
}
