// Unified config library for Scratch
//
// Storage locations:
// - ~/.scratch/credentials.json - Auth credentials (0o600)
// - ~/.scratch/secrets.json - Sensitive data like CF Access tokens (0o600)
// - ~/.config/scratch/config.toml - User preferences (0o644)
// - .scratch/project.toml - Project config (0o644)

// Types
export type { Credentials, UserConfig, UserSecrets, ProjectConfig } from './types'

// Paths
export { PATHS, DEFAULT_SERVER_URL } from './paths'

// TOML utilities
export { escapeTomlString, parseTOML, generateTOML } from './toml'
export type { TomlField } from './toml'

// User config (preferences, safe to share)
export { loadUserConfig, saveUserConfig, getServerUrl, getDefaultServerUrl } from './user-config'

// User secrets (sensitive, 0o600 permissions)
export {
  loadUserSecrets,
  saveUserSecrets,
  getCfAccessCredentials,
  saveCfAccessCredentials,
  clearCfAccessCredentials,
} from './user-secrets'

// Auth credentials
export { loadCredentials, saveCredentials, clearCredentials, requireAuth } from './credentials'

// Project config
export { loadProjectConfig, saveProjectConfig } from './project-config'

// CF Access utilities
export { getCfAccessHeaders, isCfAccessDenied, isCfAccessAuthPage } from './cf-access'
export type { CfAccessHeaders } from './cf-access'
