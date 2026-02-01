import { PATHS } from './paths'
import { loadSecureJsonFile, saveSecureJsonFile } from './secure-json'
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
  return loadSecureJsonFile<CredentialsFile>(PATHS.credentials)
}

/**
 * Save all credentials to ~/.scratch/credentials.json
 * Permissions: 0o600 (owner read/write only)
 */
async function saveCredentialsFile(credentials: CredentialsFile): Promise<void> {
  await saveSecureJsonFile(PATHS.credentials, credentials)
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
 * Get all server URLs that have valid credentials stored
 */
export async function getLoggedInServers(): Promise<string[]> {
  const allCredentials = await loadCredentialsFile()
  return Object.keys(allCredentials).filter(url => isValidCredentialEntry(allCredentials[url]))
}

