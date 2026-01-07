/**
 * User config - preferences that are safe to share/check in
 * Stored in ~/.config/scratch/config.toml (0o644)
 */
export interface UserConfig {
  server_url?: string
  namespace?: string
}

/**
 * User secrets - sensitive data that should never be shared
 * Stored in ~/.scratch/secrets.json (0o600)
 */
export interface UserSecrets {
  cf_access_client_id?: string
  cf_access_client_secret?: string
}

/**
 * Auth credentials for Scratch Cloud
 * Stored in ~/.scratch/credentials.json (0o600)
 */
export interface Credentials {
  token: string
  user: {
    id: string
    email: string
    name: string | null
  }
  server: string
}

/**
 * Project config - can be checked into version control
 * Stored in .scratch/project.toml (0o644)
 */
export interface ProjectConfig {
  name?: string
  namespace?: string
  server_url?: string
  visibility?: string
}
