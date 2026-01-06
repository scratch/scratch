import log from '../../logger'
import { initiateDeviceFlow, pollDeviceToken, getCurrentUser } from '../../cloud/api'
import { saveCredentials, loadCredentials, clearCredentials, requireAuth } from '../../cloud/credentials'
import { getServerUrl } from '../../cloud/config'
import {
  loadUserConfig,
  saveUserConfig,
  getDefaultServerUrl,
  CONFIG_PATH,
} from '../../cloud/user-config'
import { prompt, openBrowser } from '../../util'

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

export async function configCommand(): Promise<void> {
  const currentConfig = await loadUserConfig()
  const defaultUrl = getDefaultServerUrl()
  const currentUrl = currentConfig.server_url || defaultUrl

  log.info('Scratch Cloud Configuration')
  log.info('')
  log.info(`Config file: ${CONFIG_PATH}`)
  log.info('')

  // Show current value
  if (currentConfig.server_url) {
    log.info(`Current server URL: ${currentUrl}`)
  } else {
    log.info(`Current server URL: ${currentUrl} (default)`)
  }
  log.info('')

  // Prompt for new value
  const answer = await prompt(`Enter server URL [${currentUrl}]: `, currentUrl)
  let newUrl = answer

  // Add https:// if no protocol specified, but preserve http:// for localhost
  if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
    newUrl = `https://${newUrl}`
  }

  // Validate URL format
  try {
    new URL(newUrl)
  } catch {
    log.error(`Invalid URL: ${newUrl}`)
    process.exit(1)
  }

  // Enforce HTTPS for non-localhost URLs
  if (!newUrl.startsWith('https://') && !newUrl.includes('localhost')) {
    log.error('Server URL must use HTTPS (except for localhost)')
    process.exit(1)
  }

  // Save config
  await saveUserConfig({ ...currentConfig, server_url: newUrl })

  log.info('')
  if (newUrl === defaultUrl) {
    log.info(`Server URL set to ${newUrl} (default)`)
  } else {
    log.info(`Server URL set to ${newUrl}`)
  }
  log.info(`Configuration saved to ${CONFIG_PATH}`)
}
