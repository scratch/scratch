import log from '../../logger'
import { initiateDeviceFlow, pollDeviceToken, getCurrentUser } from '../../cloud/api'
import { saveCredentials, loadCredentials, clearCredentials } from '../../cloud/credentials'
import { SERVER_URL } from '../../cloud/config'

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

export async function loginCommand(): Promise<void> {
  // Check if already logged in
  const existing = await loadCredentials()
  if (existing) {
    log.info(`Already logged in as ${existing.user.email}`)
    log.info('Use "scratch cloud logout" to log out first')
    return
  }

  log.info('Logging in to Scratch Cloud...')

  // Initiate device flow
  const { device_code, user_code, verification_url, interval } = await initiateDeviceFlow()

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

  while (Date.now() - startTime < timeout) {
    await sleep(interval * 1000)

    const response = await pollDeviceToken(device_code)

    if (response.status === 'approved' && response.token && response.user) {
      // Save credentials
      await saveCredentials({
        token: response.token,
        user: response.user,
        server: SERVER_URL,
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
