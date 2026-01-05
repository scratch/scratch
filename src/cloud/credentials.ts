import { mkdir, writeFile, readFile, unlink, chmod } from 'fs/promises'
import { dirname } from 'path'
import { CREDENTIALS_PATH } from './config'
import type { Credentials } from './types'

export async function saveCredentials(credentials: Credentials): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(CREDENTIALS_PATH), { recursive: true })

  // Write credentials file with restricted permissions (owner read/write only)
  await writeFile(
    CREDENTIALS_PATH,
    JSON.stringify(credentials, null, 2) + '\n',
    { mode: 0o600 }
  )

  // Ensure permissions are set correctly (in case file already existed)
  await chmod(CREDENTIALS_PATH, 0o600)
}

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const content = await readFile(CREDENTIALS_PATH, 'utf-8')
    const data = JSON.parse(content)

    // Validate required fields
    if (!data.token || typeof data.token !== 'string') return null
    if (!data.user?.id || typeof data.user.id !== 'string') return null
    if (!data.user?.email || typeof data.user.email !== 'string') return null

    return data as Credentials
  } catch {
    return null
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    await unlink(CREDENTIALS_PATH)
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Require authentication, automatically prompting for login if not authenticated.
 * Verifies the token is still valid with the server.
 * Returns the credentials or throws if login fails.
 */
export async function requireAuth(): Promise<Credentials> {
  const credentials = await loadCredentials()

  if (credentials) {
    // Verify token is still valid
    const { getCurrentUser } = await import('./api')

    try {
      await getCurrentUser(credentials.token)
      return credentials
    } catch (error: any) {
      if (error.status === 401) {
        // Token expired/invalid, clear and re-login
        await clearCredentials()
        const log = (await import('../logger')).default
        log.info('Session expired. Starting login flow...')
      } else {
        // Other error (network, etc) - let it through, API calls will fail with better error
        return credentials
      }
    }
  }

  // Not logged in or token expired - run login flow
  const { loginCommand } = await import('../cmd/cloud/auth')
  const log = (await import('../logger')).default

  if (!credentials) {
    log.info('Not logged in. Starting login flow...')
  }

  await loginCommand()

  const newCredentials = await loadCredentials()
  if (!newCredentials) {
    throw new Error('Login failed')
  }
  return newCredentials
}
