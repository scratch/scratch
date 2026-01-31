import {
  loadProjectConfig,
  loadCredentials,
  clearCredentials,
  getCfAccessHeaders,
  normalizeServerUrlInput,
  resolveServerUrl,
  type Credentials,
  type CfAccessHeaders,
} from '../../config'
import log from '../../logger'

export interface CloudContextOptions {
  /** Server URL override from --server flag */
  serverUrl?: string
  /** Project path for loading project config */
  projectPath?: string
}

// Re-export for backward compatibility
export const normalizeServerUrl = normalizeServerUrlInput

/**
 * CloudContext provides a unified interface for cloud command operations.
 * It handles server URL resolution, credential loading, and CF Access headers.
 *
 * Server URL resolution precedence:
 * 1. CLI argument (--server flag)
 * 2. Project config (.scratch/project.toml server_url)
 * 3. If logged into exactly one server, use it
 * 4. If logged into multiple servers, prompt user to choose
 * 5. If not logged in anywhere, use default
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
   * Get the server URL only if explicitly set via CLI option.
   * Returns undefined if no explicit URL was provided.
   */
  getServerUrlIfExplicit(): string | undefined {
    if (this.options.serverUrl) {
      const { url } = normalizeServerUrl(this.options.serverUrl)
      return url
    }
    return undefined
  }

  /**
   * Get the effective server URL, using smart resolution:
   * CLI arg → project config → single logged-in server → prompt if multiple → default
   */
  async getServerUrl(): Promise<string> {
    if (!this._serverUrl) {
      // CLI argument takes precedence
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
          // Use smart server URL resolution
          this._serverUrl = await resolveServerUrl()
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
      const { getCurrentUser, CfAccessError } = await import('../../cloud/api')
      try {
        await getCurrentUser(credentials.token, {
          serverUrl,
          skipCfAccessPrompt: true,
        })
        return credentials
      } catch (error: any) {
        if (error instanceof CfAccessError) {
          // CF Access blocked - loginCommand will handle this
          log.debug('CF Access required, deferring to login flow...')
        } else if (error.status === 401) {
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

    // Not logged in or token expired or CF Access required - run login flow
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

