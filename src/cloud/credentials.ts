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
    return JSON.parse(content) as Credentials
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
 * Returns the credentials or throws if login fails.
 */
export async function requireAuth(): Promise<Credentials> {
  const credentials = await loadCredentials()
  if (credentials) {
    return credentials
  }

  // Dynamic import to avoid circular dependency
  const { loginCommand } = await import('../cmd/cloud/auth')
  const log = (await import('../logger')).default

  log.info('Not logged in. Starting login flow...')
  await loginCommand()

  const newCredentials = await loadCredentials()
  if (!newCredentials) {
    throw new Error('Login failed')
  }
  return newCredentials
}
