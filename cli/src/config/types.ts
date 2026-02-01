/**
 * Per-server CF Access credentials entry
 */
export interface CfAccessEntry {
  client_id: string
  client_secret: string
}

/**
 * CF Access credentials file structure - keyed by normalized server URL
 * Stored in ~/.scratch/cf-access.json (0o600)
 */
export interface CfAccessFile {
  [serverUrl: string]: CfAccessEntry
}

/**
 * Token type for credential storage
 * - 'session': OAuth session token (device authorization flow), uses Authorization: Bearer header
 * - 'api_key': Long-lived API token, uses X-Api-Key header
 */
export type TokenType = 'session' | 'api_key'

/**
 * Per-server credential entry (stored keyed by server URL)
 */
export interface CredentialEntry {
  token: string
  type?: TokenType  // Token type for header selection (defaults to 'session' for backwards compatibility)
  cfToken?: string  // CF Access JWT (only present when server uses cloudflare-access mode)
  user: {
    id: string
    email: string
    name: string | null
  }
}

/**
 * Full credentials file structure - keyed by normalized server URL
 * Stored in ~/.scratch/credentials.json (0o600)
 */
export interface CredentialsFile {
  [serverUrl: string]: CredentialEntry
}

/**
 * Auth credentials for Scratch Cloud (includes server URL for convenience)
 */
export interface Credentials extends CredentialEntry {
  server: string
}

/**
 * Project config - can be checked into version control
 * Stored in .scratch/project.toml (0o644)
 */
export interface ProjectConfig {
  id?: string  // Project ID from server (do not modify)
  name?: string
  server_url?: string
  visibility?: string
}

/**
 * Global user config - applies to all projects
 * Stored in ~/.config/scratch/config.toml (0o644)
 */
export interface GlobalConfig {
  server_url?: string
  visibility?: string
}
