import { mkdir, writeFile, readFile, chmod } from 'fs/promises'
import { dirname } from 'path'
import { PATHS } from './paths'
import { normalizeServerUrl } from './credentials'
import type { CfAccessEntry, CfAccessFile } from './types'

export interface CfAccessHeaders {
  'CF-Access-Client-Id': string
  'CF-Access-Client-Secret': string
}

/**
 * Load all CF Access credentials from ~/.scratch/cf-access.json
 * Returns empty object if file doesn't exist or is invalid
 */
async function loadCfAccessFile(): Promise<CfAccessFile> {
  try {
    const content = await readFile(PATHS.cfAccess, 'utf-8')
    const data = JSON.parse(content)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return {}
    }
    return data as CfAccessFile
  } catch {
    return {}
  }
}

/**
 * Save all CF Access credentials to ~/.scratch/cf-access.json
 * Permissions: 0o600 (owner read/write only)
 */
async function saveCfAccessFile(cfAccess: CfAccessFile): Promise<void> {
  await mkdir(dirname(PATHS.cfAccess), { recursive: true })
  await writeFile(PATHS.cfAccess, JSON.stringify(cfAccess, null, 2) + '\n', { mode: 0o600 })
  await chmod(PATHS.cfAccess, 0o600)
}

/**
 * Validate a CF Access entry has required fields
 */
function isValidCfAccessEntry(entry: unknown): entry is CfAccessEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as Record<string, unknown>
  if (!e.client_id || typeof e.client_id !== 'string') return false
  if (!e.client_secret || typeof e.client_secret !== 'string') return false
  return true
}

/**
 * Get CF Access credentials for a specific server
 * Returns null if not configured for that server
 */
export async function getCfAccessCredentials(serverUrl: string): Promise<{
  clientId: string
  clientSecret: string
} | null> {
  const normalizedUrl = normalizeServerUrl(serverUrl)
  const allCfAccess = await loadCfAccessFile()
  const entry = allCfAccess[normalizedUrl]

  if (!isValidCfAccessEntry(entry)) {
    return null
  }

  return {
    clientId: entry.client_id,
    clientSecret: entry.client_secret,
  }
}

/**
 * Save CF Access credentials for a specific server
 */
export async function saveCfAccessCredentials(
  clientId: string,
  clientSecret: string,
  serverUrl: string
): Promise<void> {
  const normalizedUrl = normalizeServerUrl(serverUrl)
  const allCfAccess = await loadCfAccessFile()
  allCfAccess[normalizedUrl] = {
    client_id: clientId,
    client_secret: clientSecret,
  }
  await saveCfAccessFile(allCfAccess)
}

/**
 * Clear CF Access credentials for a specific server
 */
export async function clearCfAccessCredentials(serverUrl: string): Promise<void> {
  const normalizedUrl = normalizeServerUrl(serverUrl)
  const allCfAccess = await loadCfAccessFile()

  if (normalizedUrl in allCfAccess) {
    delete allCfAccess[normalizedUrl]
    await saveCfAccessFile(allCfAccess)
  }
}

/**
 * Get CF Access headers for a specific server if configured.
 * Returns undefined if no token is configured for that server.
 */
export async function getCfAccessHeaders(serverUrl: string): Promise<CfAccessHeaders | undefined> {
  const credentials = await getCfAccessCredentials(serverUrl)

  if (!credentials) {
    return undefined
  }

  return {
    'CF-Access-Client-Id': credentials.clientId,
    'CF-Access-Client-Secret': credentials.clientSecret,
  }
}

/**
 * Check if a response is a CF Access denial.
 * Only returns true for 403 responses with clear CF Access indicators.
 */
export function isCfAccessDenied(response: Response): boolean {
  if (response.status !== 403) {
    return false
  }

  // CF Access sets this header when it blocks a request
  return response.headers.has('cf-mitigated')
}

/**
 * Check if a response is a CF Access authentication page.
 * Cloudflare returns an HTML login page when:
 * - Service tokens are expired/invalid
 * - No CF Access credentials were provided but the server requires them
 * This detects that case by checking for HTML content with CF Access indicators.
 */
export function isCfAccessAuthPage(response: Response, responseText: string): boolean {
  // Only check for non-OK responses that are HTML
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    return false
  }

  // Look for CF Access-specific indicators in the HTML
  // These strings appear in the Cloudflare Access login/authentication page
  const cfAccessIndicators = [
    'cloudflareaccess',
    'cf-access',
    'access.cloudflare',
    'Access-Jwt-Assertion',
    'CF_Authorization',
    'cloudflare-static',
  ]

  const lowerText = responseText.toLowerCase()
  return cfAccessIndicators.some(indicator => lowerText.includes(indicator.toLowerCase()))
}
