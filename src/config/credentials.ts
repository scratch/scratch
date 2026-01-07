import { mkdir, writeFile, readFile, unlink, chmod } from 'fs/promises'
import { dirname } from 'path'
import { PATHS } from './paths'
import type { Credentials } from './types'

/**
 * Save auth credentials to ~/.scratch/credentials.json
 * Permissions: 0o600 (owner read/write only)
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(PATHS.credentials), { recursive: true })

  // Write credentials file with restricted permissions (owner read/write only)
  await writeFile(PATHS.credentials, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 })

  // Ensure permissions are set correctly (in case file already existed)
  await chmod(PATHS.credentials, 0o600)
}

/**
 * Load auth credentials from ~/.scratch/credentials.json
 * Returns null if file doesn't exist or is invalid
 */
export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const content = await readFile(PATHS.credentials, 'utf-8')
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

/**
 * Clear auth credentials by removing the file
 */
export async function clearCredentials(): Promise<void> {
  try {
    await unlink(PATHS.credentials)
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
    const { getCurrentUser } = await import('../cloud/api')

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
