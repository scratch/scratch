import { mkdir, writeFile, readFile, chmod } from 'fs/promises'
import { dirname } from 'path'
import { PATHS } from './paths'
import { getServerUrl } from './user-config'
import type { Credentials, CredentialEntry, CredentialsFile } from './types'

/**
 * Normalize a server URL for use as a credential key.
 * Ensures consistent keys by removing trailing slashes and converting to lowercase.
 */
export function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase()
}

/**
 * Load all credentials from ~/.scratch/credentials.json
 * Returns empty object if file doesn't exist or is invalid
 */
async function loadCredentialsFile(): Promise<CredentialsFile> {
  try {
    const content = await readFile(PATHS.credentials, 'utf-8')
    const data = JSON.parse(content)
    // Basic validation - should be an object
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return {}
    }
    return data as CredentialsFile
  } catch {
    return {}
  }
}

/**
 * Save all credentials to ~/.scratch/credentials.json
 * Permissions: 0o600 (owner read/write only)
 */
async function saveCredentialsFile(credentials: CredentialsFile): Promise<void> {
  await mkdir(dirname(PATHS.credentials), { recursive: true })
  await writeFile(PATHS.credentials, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 })
  await chmod(PATHS.credentials, 0o600)
}

/**
 * Validate a credential entry has required fields
 */
function isValidCredentialEntry(entry: unknown): entry is CredentialEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as Record<string, unknown>
  if (!e.token || typeof e.token !== 'string') return false
  if (typeof e.user !== 'object' || e.user === null) return false
  const user = e.user as Record<string, unknown>
  if (!user.id || typeof user.id !== 'string') return false
  if (!user.email || typeof user.email !== 'string') return false
  return true
}

/**
 * Save auth credentials for a specific server to ~/.scratch/credentials.json
 * Merges with existing credentials for other servers.
 */
export async function saveCredentials(entry: CredentialEntry, serverUrl: string): Promise<void> {
  const normalizedUrl = normalizeServerUrl(serverUrl)
  const allCredentials = await loadCredentialsFile()
  allCredentials[normalizedUrl] = entry
  await saveCredentialsFile(allCredentials)
}

/**
 * Load auth credentials for a specific server from ~/.scratch/credentials.json
 * Returns null if no credentials exist for that server
 */
export async function loadCredentials(serverUrl: string): Promise<Credentials | null> {
  const normalizedUrl = normalizeServerUrl(serverUrl)
  const allCredentials = await loadCredentialsFile()
  const entry = allCredentials[normalizedUrl]

  if (!isValidCredentialEntry(entry)) {
    return null
  }

  return {
    ...entry,
    server: serverUrl,
  }
}

/**
 * Clear auth credentials for a specific server
 */
export async function clearCredentials(serverUrl: string): Promise<void> {
  const normalizedUrl = normalizeServerUrl(serverUrl)
  const allCredentials = await loadCredentialsFile()

  if (normalizedUrl in allCredentials) {
    delete allCredentials[normalizedUrl]
    await saveCredentialsFile(allCredentials)
  }
}

/**
 * Require authentication, automatically prompting for login if not authenticated.
 * Verifies the token is still valid with the server.
 * Returns the credentials or throws if login fails.
 *
 * @param serverUrl - Optional server URL. If not provided, uses getServerUrl() default.
 */
export async function requireAuth(serverUrl?: string): Promise<Credentials> {
  const effectiveUrl = serverUrl || (await getServerUrl())
  const credentials = await loadCredentials(effectiveUrl)

  if (credentials) {
    // Verify token is still valid
    const { getCurrentUser } = await import('../cloud/api')

    try {
      await getCurrentUser(credentials.token, effectiveUrl)
      return credentials
    } catch (error: any) {
      if (error.status === 401) {
        // Token expired/invalid, clear and re-login
        await clearCredentials(effectiveUrl)
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

  await loginCommand(effectiveUrl)

  const newCredentials = await loadCredentials(effectiveUrl)
  if (!newCredentials) {
    throw new Error('Login failed')
  }
  return newCredentials
}
