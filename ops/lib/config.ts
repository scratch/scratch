// Configuration validation helpers
// Used by ops commands to validate config before running

import { existsSync, readFileSync, writeFileSync } from 'fs'

// File paths
export const VARS_EXAMPLE = 'server/.vars.example'
export const WRANGLER_TEMPLATE = 'server/wrangler.template.toml'
export const ENV_TS = 'server/src/env.ts'
export const GITIGNORE = '.gitignore'

// Get the vars file path for an instance
export function getInstanceVarsPath(instance: string): string {
  return `server/.${instance}.vars`
}

// Get the wrangler config path for an instance (full path for file operations)
export function getInstanceWranglerPath(instance: string): string {
  return `server/wrangler.${instance}.toml`
}

// Alias for getInstanceWranglerPath - returns the full path for file operations
// e.g., "server/wrangler.staging.toml"
export function getWranglerConfigPath(instance: string): string {
  return getInstanceWranglerPath(instance)
}

// Returns the wrangler config path for use with wrangler CLI (relative to server/)
// e.g., "wrangler.staging.toml"
export function getWranglerConfigArg(instance: string): string {
  return `wrangler.${instance}.toml`
}

// Write a vars file from key-value pairs
export function writeVarsFile(path: string, vars: Map<string, string>): void {
  const lines: string[] = []
  for (const [name, value] of vars) {
    lines.push(`${name}=${value}`)
  }
  writeFileSync(path, lines.join('\n') + '\n')
}

// Parse a .vars file and return key-value pairs
export function parseVarsFile(path: string): Map<string, string> {
  const vars = new Map<string, string>()
  if (!existsSync(path)) return vars

  const content = readFileSync(path, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) {
      let value = match[2]
      // Strip surrounding quotes (both single and double)
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      // Trim whitespace from unquoted values
      value = value.trim()
      vars.set(match[1], value)
    }
  }
  return vars
}

// Get required variable names from .vars.example
export function getRequiredVars(): string[] {
  const vars = parseVarsFile(VARS_EXAMPLE)
  return Array.from(vars.keys())
}

// Get runtime variable names (excludes config-only vars like CLOUDFLARE_ACCOUNT_ID)
// Used for pushing secrets and generating env.ts
export function getRuntimeVars(): string[] {
  return getRequiredVars().filter(v => !CONFIG_ONLY_VARS.includes(v))
}

// Get variables with their documentation comments from .vars.example
export function getRequiredVarsWithComments(): { name: string; defaultValue: string; comments: string[] }[] {
  if (!existsSync(VARS_EXAMPLE)) return []

  const content = readFileSync(VARS_EXAMPLE, 'utf-8')
  const lines = content.split('\n')
  const result: { name: string; defaultValue: string; comments: string[] }[] = []

  let pendingComments: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '') {
      // Empty line resets pending comments
      pendingComments = []
      continue
    }

    if (trimmed.startsWith('#')) {
      // Accumulate comment (strip the # and leading space)
      const comment = trimmed.replace(/^#\s?/, '')
      pendingComments.push(comment)
      continue
    }

    // Check if it's a variable definition
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) {
      let value = match[2]
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      // Trim whitespace from unquoted values
      value = value.trim()

      result.push({
        name: match[1],
        defaultValue: value,
        comments: pendingComments,
      })
      pendingComments = []
    }
  }

  return result
}

// Parse wrangler template and extract key values
export function parseWranglerTemplate(): {
  main?: string
  port?: number
  r2Binding?: string
  r2Bucket?: string
} {
  if (!existsSync(WRANGLER_TEMPLATE)) return {}

  const content = readFileSync(WRANGLER_TEMPLATE, 'utf-8')
  const result: ReturnType<typeof parseWranglerTemplate> = {}

  // Extract main entry point
  const mainMatch = content.match(/^main\s*=\s*"([^"]+)"/m)
  if (mainMatch) result.main = mainMatch[1]

  // Extract dev port (match "port = " but not "inspector_port = ")
  const portMatch = content.match(/^\[dev\][^\[]*\n\s*port\s*=\s*(\d+)/ms)
  if (portMatch) result.port = parseInt(portMatch[1])

  // Extract R2 binding
  const r2Match = content.match(/\[\[r2_buckets\]\][^\[]*binding\s*=\s*"([^"]+)"[^\[]*bucket_name\s*=\s*"([^"]+)"/ms)
  if (r2Match) {
    result.r2Binding = r2Match[1]
    result.r2Bucket = r2Match[2]
  }

  return result
}

// Check if .gitignore contains required patterns
export function checkGitignore(): { hasEnvPattern: boolean; hasVarsPattern: boolean } {
  if (!existsSync(GITIGNORE)) {
    return { hasEnvPattern: false, hasVarsPattern: false }
  }

  const content = readFileSync(GITIGNORE, 'utf-8')
  const lines = content.split('\n').map(l => l.trim())

  return {
    hasEnvPattern: lines.some(l => l === '*.env' || l === '.env' || l === '.env*'),
    hasVarsPattern: lines.some(l => l === '*.vars' || l === '.dev.vars' || l === '.*.vars'),
  }
}

// Check if env.ts contains all required variables
export function checkEnvTs(requiredVars: string[]): { missing: string[]; found: string[] } {
  if (!existsSync(ENV_TS)) {
    return { missing: requiredVars, found: [] }
  }

  const content = readFileSync(ENV_TS, 'utf-8')
  const found: string[] = []
  const missing: string[] = []

  for (const varName of requiredVars) {
    // Look for "VAR_NAME:" or "VAR_NAME?:" in the interface
    const pattern = new RegExp(`\\b${varName}\\??\\s*:`)
    if (pattern.test(content)) {
      found.push(varName)
    } else {
      missing.push(varName)
    }
  }

  return { missing, found }
}

// Generate env.ts content from .vars.example
export function generateEnvTs(requiredVars: string[]): string {
  const varLines = requiredVars.map(v => `  ${v}: string`).join('\n')

  return `// Auto-generated from .vars.example - do not edit manually
// Regenerate with: bun run ops regenerate-env-ts

export interface Env {
  // Wrangler bindings (not in .vars.example)
  FILES: R2Bucket
  DB: D1Database

  // Environment variables
${varLines}

  // Testing (optional, set via --var flag)
  TEST_MODE?: string
}
`
}

// Variables required for wrangler template substitution
export const WRANGLER_TEMPLATE_VARS = [
  'D1_DATABASE_ID',
  'APP_PORT',
]

// Variables that are config-only (not pushed as secrets, not in env.ts)
// These are used only for wrangler config generation
export const CONFIG_ONLY_VARS = [
  'CLOUDFLARE_ACCOUNT_ID',
]

// Get resource names derived from instance
export function getInstanceResourceNames(instance: string) {
  return {
    workerName: `${instance}-scratch-server`,
    bucketName: `${instance}-scratch-files`,
    dbName: `${instance}-scratch-db`,
  }
}

// Variables required for production routes
export const ROUTE_VARS = [
  'BASE_DOMAIN',
  'APP_SUBDOMAIN',
  'CONTENT_SUBDOMAIN',
]

// Auth mode constants
export type AuthMode = 'local' | 'cloudflare-access'

// Variables always required regardless of auth mode
export const COMMON_AUTH_VARS = ['BETTER_AUTH_SECRET']

// Variables required only for local (BetterAuth) mode
export const LOCAL_AUTH_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']

// Variables required only for cloudflare-access mode
export const CF_ACCESS_AUTH_VARS = ['CLOUDFLARE_ACCESS_TEAM']

// Check if a value is effectively unset (empty or placeholder)
export function isUnset(value: string | undefined): boolean {
  return !value || value === '' || value === '_'
}

// Validate UUID format (for D1_DATABASE_ID)
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

// Validate that all required template variables are set for an instance
export function validateInstanceVars(instance: string): { valid: boolean; missing: string[]; empty: string[]; invalid: string[] } {
  const varsPath = getInstanceVarsPath(instance)
  if (!existsSync(varsPath)) {
    return { valid: false, missing: ['(file not found)'], empty: [], invalid: [] }
  }

  const vars = parseVarsFile(varsPath)
  const missing: string[] = []
  const empty: string[] = []
  const invalid: string[] = []

  // Check template vars
  for (const name of WRANGLER_TEMPLATE_VARS) {
    if (!vars.has(name)) {
      missing.push(name)
    } else if (vars.get(name) === '') {
      empty.push(name)
    }
  }

  // Check route vars
  for (const name of ROUTE_VARS) {
    if (!vars.has(name)) {
      missing.push(name)
    } else if (vars.get(name) === '') {
      empty.push(name)
    }
  }

  // Check auth vars based on AUTH_MODE
  const authMode = vars.get('AUTH_MODE') || 'local'

  // Common auth vars are always required
  for (const name of COMMON_AUTH_VARS) {
    if (!vars.has(name)) {
      missing.push(name)
    } else if (isUnset(vars.get(name))) {
      empty.push(name)
    }
  }

  // Mode-specific auth vars
  if (authMode === 'cloudflare-access') {
    for (const name of CF_ACCESS_AUTH_VARS) {
      if (!vars.has(name)) {
        missing.push(name)
      } else if (isUnset(vars.get(name))) {
        empty.push(name)
      }
    }
  } else {
    // Default to local mode
    for (const name of LOCAL_AUTH_VARS) {
      if (!vars.has(name)) {
        missing.push(name)
      } else if (isUnset(vars.get(name))) {
        empty.push(name)
      }
    }
  }

  // Validate D1_DATABASE_ID is a valid UUID
  const d1Id = vars.get('D1_DATABASE_ID')
  if (d1Id && d1Id !== '' && !isValidUUID(d1Id)) {
    invalid.push('D1_DATABASE_ID (must be a valid UUID)')
  }

  return {
    valid: missing.length === 0 && empty.length === 0 && invalid.length === 0,
    missing,
    empty,
    invalid,
  }
}
