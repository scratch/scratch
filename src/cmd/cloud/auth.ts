import log from '../../logger'
import { initiateDeviceFlow, pollDeviceToken, getCurrentUser } from '../../cloud/api'
import { saveCredentials, loadCredentials, clearCredentials } from '../../cloud/credentials'
import { getServerUrl } from '../../cloud/config'
import {
  loadUserConfig,
  saveUserConfig,
  getDefaultServerUrl,
  CONFIG_PATH,
} from '../../cloud/user-config'

// Open URL in browser (cross-platform)
async function openBrowser(url: string): Promise<void> {
  const { platform } = process
  let command: string

  if (platform === 'darwin') {
    command = `open "${url}"`
  } else if (platform === 'win32') {
    command = `start "" "${url}"`
  } else {
    command = `xdg-open "${url}"`
  }

  const proc = Bun.spawn(['sh', '-c', command], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await proc.exited
}

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
  log.debug(`Server URL: ${serverUrl}`)

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

  log.info('Logging in to Scratch Cloud...')
  log.debug(`Connecting to ${serverUrl}/auth/device`)

  // Initiate device flow
  let deviceFlowResponse
  try {
    deviceFlowResponse = await initiateDeviceFlow()
  } catch (error: any) {
    throw formatConnectionError(error, serverUrl)
  }

  const { device_code, user_code, verification_url, interval } = deviceFlowResponse

  // Display code and open browser
  console.log('')
  console.log('Your verification code is:')
  console.log('')
  console.log(`    ${user_code}`)
  console.log('')
  console.log('Opening browser to complete authentication...')
  console.log(`(If browser doesn't open, visit: ${verification_url})`)
  console.log('')

  await openBrowser(verification_url)

  // Poll for approval
  console.log('Waiting for approval...')

  const startTime = Date.now()
  const timeout = 10 * 60 * 1000 // 10 minutes
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

      console.log('')
      log.info(`Logged in as ${response.user.email}`)
      return
    }

    if (response.status === 'denied') {
      console.log('')
      log.error('Login denied')
      process.exit(1)
    }

    if (response.status === 'expired') {
      console.log('')
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
    log.info('Use "scratch cloud login" to log in')
    return
  }

  try {
    // Verify token is still valid by calling /api/me
    const { user } = await getCurrentUser(credentials.token)

    console.log(`Email: ${user.email}`)
    if (user.name) {
      console.log(`Name:  ${user.name}`)
    }
    console.log(`Server: ${credentials.server}`)
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

  console.log('Scratch Cloud Configuration')
  console.log('')
  console.log(`Config file: ${CONFIG_PATH}`)
  console.log('')

  // Show current value
  if (currentConfig.server_url) {
    console.log(`Current server URL: ${currentUrl}`)
  } else {
    console.log(`Current server URL: ${currentUrl} (default)`)
  }
  console.log('')

  // Prompt for new value
  process.stdout.write(`Enter server URL [${currentUrl}]: `)

  const reader = (await import('readline')).createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>(resolve => {
    reader.question('', answer => {
      reader.close()
      resolve(answer.trim())
    })
  })

  let newUrl = answer || currentUrl

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

  // Save config
  await saveUserConfig({ ...currentConfig, server_url: newUrl })

  console.log('')
  if (newUrl === defaultUrl) {
    log.info(`Server URL set to ${newUrl} (default)`)
  } else {
    log.info(`Server URL set to ${newUrl}`)
  }
  console.log(`Configuration saved to ${CONFIG_PATH}`)
}
