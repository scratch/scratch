// Project name and namespace validation
// Shared between server and CLI

const PROJECT_NAME_REGEX = /^[a-z][a-z0-9-]{2,62}$/
const NAMESPACE_REGEX = /^[a-z0-9][a-z0-9-]*\.[a-z0-9.-]+$/ // Must contain a dot

// The global namespace value (stored as 'global' in DB, displayed as '_' in URLs by default)
export const GLOBAL_NAMESPACE = 'global'

// Default URL representation of the global namespace
export const DEFAULT_GLOBAL_NAMESPACE_URL = '_'

// Values that should be normalized to 'global'
const GLOBAL_NAMESPACE_ALIASES = ['_', 'global', '']

// Normalize namespace value - converts aliases to 'global'
export function normalizeNamespace(namespace: string | null | undefined): string {
  if (namespace === null || namespace === undefined) return GLOBAL_NAMESPACE
  if (GLOBAL_NAMESPACE_ALIASES.includes(namespace.toLowerCase())) return GLOBAL_NAMESPACE
  return namespace
}

// Check if a value represents the global namespace
export function isGlobalNamespace(namespace: string | null | undefined): boolean {
  if (namespace === null || namespace === undefined) return true
  return GLOBAL_NAMESPACE_ALIASES.includes(namespace.toLowerCase())
}

const RESERVED_NAMES = [
  'api',
  'auth',
  'admin',
  'www',
  'app',
  'help',
  'support',
  'static',
  'assets',
  'cdn',
  'files',
  'upload',
  'download',
]

export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateProjectName(name: string): ValidationResult {
  if (!PROJECT_NAME_REGEX.test(name)) {
    return {
      valid: false,
      error:
        'Project name must be 3-63 characters, lowercase letters, numbers, and hyphens, starting with a letter',
    }
  }
  if (RESERVED_NAMES.includes(name)) {
    return { valid: false, error: 'This project name is reserved' }
  }
  return { valid: true }
}

export function validateNamespace(
  namespace: string | null | undefined
): ValidationResult {
  // Normalize first - null/undefined/'_'/'' all become 'global'
  const normalized = normalizeNamespace(namespace)

  // Global namespace is always valid
  if (normalized === GLOBAL_NAMESPACE) {
    return { valid: true }
  }

  // Custom namespace must be domain-like
  if (!NAMESPACE_REGEX.test(normalized)) {
    return {
      valid: false,
      error: 'Namespace must be a domain-like string (e.g., acme.com)',
    }
  }
  if (normalized.length > 253) {
    return { valid: false, error: 'Namespace too long (max 253 characters)' }
  }
  return { valid: true }
}

// Validate that namespace matches the user's email domain
export function validateNamespaceForUser(
  namespace: string | null | undefined,
  userEmail: string
): ValidationResult {
  const normalized = normalizeNamespace(namespace)

  // First do basic validation
  const basicResult = validateNamespace(normalized)
  if (!basicResult.valid) {
    return basicResult
  }

  // Global namespace is always allowed
  if (normalized === GLOBAL_NAMESPACE) {
    return { valid: true }
  }

  // Extract domain from email
  const emailDomain = userEmail.split('@')[1]?.toLowerCase()
  if (!emailDomain) {
    return { valid: false, error: 'Invalid user email' }
  }

  // Namespace must match user's email domain
  if (normalized.toLowerCase() !== emailDomain) {
    return {
      valid: false,
      error: `Namespace must match your email domain (${emailDomain})`,
    }
  }

  return { valid: true }
}

// Extract domain from email address
export function getEmailDomain(email: string): string | null {
  const parts = email.split('@')
  if (parts.length !== 2) return null
  return parts[1].toLowerCase()
}
