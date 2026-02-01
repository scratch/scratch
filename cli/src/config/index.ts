// Unified config library for Scratch
//
// Storage locations:
// - ~/.scratch/credentials.json - Auth credentials (0o600)
// - ~/.scratch/cf-access.json - CF Access service tokens (0o600)
// - .scratch/project.toml - Project config (0o644)

// Types
export type { Credentials, CredentialEntry, CredentialsFile, ProjectConfig, GlobalConfig, CfAccessEntry, CfAccessFile } from './types'

// Paths and server URL utilities
export { PATHS, DEFAULT_SERVER_URL, getServerUrl, getDefaultServerUrl } from './paths'

// TOML utilities
export { escapeTomlString, generateTOML } from './toml'
export type { TomlField } from './toml'

// Auth credentials
export { loadCredentials, saveCredentials, clearCredentials, normalizeServerUrl, getLoggedInServers } from './credentials'

// Project config
export { loadProjectConfig, saveProjectConfig } from './project-config'

// Global config
export { loadGlobalConfig, saveGlobalConfig } from './global-config'

// CF Access utilities (all functions now require serverUrl parameter)
export {
  getCfAccessCredentials,
  saveCfAccessCredentials,
  clearCfAccessCredentials,
  getCfAccessHeaders,
  isCfAccessDenied,
  isCfAccessAuthPage,
} from './cf-access'
export type { CfAccessHeaders } from './cf-access'

// Prompts for interactive configuration
export {
  // Server URL
  validateServerUrl,
  normalizeServerUrlInput,
  promptServerUrl,
  promptServerUrlSelection,
  resolveServerUrl,
  // Project name
  deriveProjectName,
  promptProjectName,
  // Visibility
  promptVisibility,
  promptCustomVisibility,
} from './prompts'
