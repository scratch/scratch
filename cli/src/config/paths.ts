import { homedir } from 'os'
import { join } from 'path'

/**
 * Centralized path definitions for all config and secrets files
 */
export const PATHS = {
  // Secrets directory - owner-only permissions (0o600)
  secretsDir: join(homedir(), '.scratch'),
  credentials: join(homedir(), '.scratch', 'credentials.json'),
  cfAccess: join(homedir(), '.scratch', 'cf-access.json'),
  secrets: join(homedir(), '.scratch', 'secrets.json'), // deprecated, see cf-access.json

  // Config directory - XDG-compliant, world-readable (0o644)
  configDir: join(homedir(), '.config', 'scratch'),
  userConfig: join(homedir(), '.config', 'scratch', 'config.toml'),

  // Project config - relative path
  projectConfig: '.scratch/project.toml',
} as const

export const DEFAULT_SERVER_URL = 'https://app.scratch.dev'
