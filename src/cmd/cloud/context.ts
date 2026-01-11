import {
  loadProjectConfig,
  getServerUrl,
  loadCredentials,
  clearCredentials,
  getCfAccessHeaders,
  type Credentials,
  type CfAccessHeaders,
} from '../../config'
import log from '../../logger'

export interface CloudContextOptions {
  /** Server URL override from --server-url flag */
  serverUrl?: string
  /** Project path for loading project config */
  projectPath?: string
}

// Common multi-part TLDs where naked domain has 3 parts instead of 2
const MULTI_PART_TLDS = [
  '.co.uk', '.org.uk', '.gov.uk', '.ac.uk',
  '.com.au', '.net.au', '.org.au',
  '.co.nz', '.co.jp', '.co.in', '.co.za',
  '.com.br', '.com.mx', '.com.cn',
]

/**
 * Check if a hostname is a naked domain (no subdomain).
 * e.g., "scratch.dev" is naked, "app.scratch.dev" is not.
 * Handles multi-part TLDs like .co.uk
 */
function isNakedDomain(hostname: string): boolean {
  // Don't modify localhost
  if (hostname === 'localhost' || hostname.startsWith('localhost:')) {
    return false
  }

  const lowerHostname = hostname.toLowerCase()
  const parts = hostname.split('.')

  // Check for multi-part TLDs
  for (const tld of MULTI_PART_TLDS) {
    if (lowerHostname.endsWith(tld)) {
      // For multi-part TLDs like .co.uk, naked domain has 3 parts (example.co.uk)
      return parts.length === 3
    }
  }

  // For standard single-part TLDs, naked domain has 2 parts (example.com)
  return parts.length === 2
}

/**
 * Normalize a server URL:
 * - Add https:// if no protocol specified
 * - Add app. subdomain if naked domain
 * Returns { url, modified } where modified is true if app. was added
 */
export function normalizeServerUrl(url: string): { url: string; modified: boolean } {
  let modified = false

  // Add https:// if no protocol specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  // Parse and check if naked domain
  try {
    const parsed = new URL(url)
    if (isNakedDomain(parsed.hostname)) {
      parsed.hostname = `app.${parsed.hostname}`
      url = parsed.toString().replace(/\/$/, '') // Remove trailing slash
      modified = true
    }
  } catch {
    // Invalid URL, return as-is
  }

  return { url, modified }
}

/**
 * CloudContext provides a unified interface for cloud command operations.
 * It handles server URL resolution, credential loading, and CF Access headers.
 *
 * Server URL resolution precedence:
 * 1. CLI flag (--server-url)
 * 2. Project config (.scratch/project.toml server_url)
 * 3. Global config (~/.config/scratch/config.toml server_url)
 * 4. Default (https://app.scratch.dev)
 */
export class CloudContext {
  private options: CloudContextOptions
  private _serverUrl?: string
  private _credentials?: Credentials
  private _cfAccessHeaders?: CfAccessHeaders | null // null means "checked but not configured"

  constructor(options: CloudContextOptions = {}) {
    this.options = options
  }

  /**
   * Get the effective server URL, resolving from options → project config → global config → default
   */
  async getServerUrl(): Promise<string> {
    if (!this._serverUrl) {
      // CLI flag takes precedence
      if (this.options.serverUrl) {
        const { url, modified } = normalizeServerUrl(this.options.serverUrl)
        this._serverUrl = url
        if (modified) {
          log.info(`Using ${url}`)
        }
      } else {
        // Check project config
        const projectConfig = await loadProjectConfig(this.options.projectPath || '.')
        if (projectConfig.server_url) {
          this._serverUrl = projectConfig.server_url
        } else {
          // Fall back to global config or default
          this._serverUrl = await getServerUrl()
        }
      }
    }
    return this._serverUrl
  }

  /**
   * Get credentials for the current server without prompting for login.
   * Returns null if not logged in.
   */
  async getCredentials(): Promise<Credentials | null> {
    if (this._credentials === undefined) {
      const serverUrl = await this.getServerUrl()
      this._credentials = (await loadCredentials(serverUrl)) ?? undefined
    }
    return this._credentials ?? null
  }

  /**
   * Require authentication, automatically prompting for login if not authenticated.
   * Verifies the token is still valid with the server.
   */
  async requireAuth(): Promise<Credentials> {
    const serverUrl = await this.getServerUrl()

    // Try existing credentials
    let credentials = await this.getCredentials()
    if (credentials) {
      // Verify token is still valid
      const { getCurrentUser } = await import('../../cloud/api')
      try {
        await getCurrentUser(credentials.token, serverUrl)
        return credentials
      } catch (error: any) {
        if (error.status === 401) {
          // Token expired/invalid, clear and re-login
          await clearCredentials(serverUrl)
          this._credentials = undefined
          log.info('Session expired. Starting login flow...')
        } else {
          // Other error (network, etc) - let it through, API calls will fail with better error
          return credentials
        }
      }
    }

    // Not logged in or token expired - run login flow
    const { loginCommand } = await import('./auth')

    if (!credentials) {
      log.info('Not logged in. Starting login flow...')
    }

    await loginCommand(serverUrl)

    // Reload credentials
    this._credentials = undefined
    credentials = await this.getCredentials()
    if (!credentials) {
      throw new Error('Login failed')
    }
    return credentials
  }

  /**
   * Get CF Access headers for the current server if configured.
   * Returns undefined if no CF Access token is configured.
   */
  async getCfAccessHeaders(): Promise<CfAccessHeaders | undefined> {
    if (this._cfAccessHeaders === undefined) {
      const serverUrl = await this.getServerUrl()
      const headers = await getCfAccessHeaders(serverUrl)
      this._cfAccessHeaders = headers ?? null
    }
    return this._cfAccessHeaders ?? undefined
  }

  /**
   * Clear cached state. Call this after login/logout to reset.
   */
  clearCache(): void {
    this._credentials = undefined
    this._cfAccessHeaders = undefined
  }
}

/**
 * Create a CloudContext from Commander.js options.
 * Extracts --server-url from parent command options if present.
 */
export function createCloudContext(options: { serverUrl?: string }, projectPath?: string): CloudContext {
  return new CloudContext({
    serverUrl: options.serverUrl,
    projectPath,
  })
}
