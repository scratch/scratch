// Project name validation and URL utilities
// Shared between server and CLI

const PROJECT_NAME_REGEX = /^[a-z][a-z0-9-]{2,62}$/

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

// =============================================================================
// Email utilities
// =============================================================================

// Extract local part from email (e.g., "pete" from "pete@mydomain.com")
export function getEmailLocalPart(email: string): string | null {
  const atIndex = email.indexOf('@')
  if (atIndex === -1) return null
  return email.substring(0, atIndex).toLowerCase()
}

// Extract domain from email address (e.g., "mydomain.com" from "pete@mydomain.com")
export function getEmailDomain(email: string): string | null {
  const parts = email.split('@')
  if (parts.length !== 2) return null
  return parts[1].toLowerCase()
}

// =============================================================================
// ALLOWED_USERS utilities
// =============================================================================

// Check if ALLOWED_USERS is a single domain (e.g., "@mydomain.com")
// Returns the domain without @ if it is, null otherwise
export function isSingleDomainAllowedUsers(allowedUsers: string): string | null {
  const trimmed = (allowedUsers || '').trim()
  // Must be exactly one domain like "@mydomain.com"
  if (trimmed.startsWith('@') && !trimmed.includes(',')) {
    return trimmed.substring(1).toLowerCase()
  }
  return null
}

// =============================================================================
// URL building
// =============================================================================

export interface ProjectUrls {
  primary: string  // Short URL (local-part) when single domain, or email URL
  byId: string     // User ID URL (always works)
}

export interface BuildProjectUrlsOptions {
  pagesDomain: string
  projectName: string
  ownerId: string
  ownerEmail: string
  allowedUsers: string
}

export function buildProjectUrls(options: BuildProjectUrlsOptions): ProjectUrls {
  const { pagesDomain, projectName, ownerId, ownerEmail, allowedUsers } = options
  const protocol = pagesDomain.includes('localhost') ? 'http' : 'https'

  const byId = `${protocol}://${pagesDomain}/${ownerId}/${projectName}/`

  const singleDomain = isSingleDomainAllowedUsers(allowedUsers)
  let primary: string
  if (singleDomain) {
    const localPart = getEmailLocalPart(ownerEmail)
    primary = `${protocol}://${pagesDomain}/${localPart}/${projectName}/`
  } else {
    primary = `${protocol}://${pagesDomain}/${ownerEmail.toLowerCase()}/${projectName}/`
  }

  return { primary, byId }
}

// =============================================================================
// URL parsing for content serving
// =============================================================================

export interface ParsedPagePath {
  ownerIdentifier: string  // Could be user ID, email, or local-part
  projectName: string
  filePath: string
}

// Parse a page path into its components
// Path format: /owner-identifier/project-name/file-path
export function parsePagePath(pathname: string): ParsedPagePath | null {
  // Remove leading slash and split
  const parts = pathname.slice(1).split('/')

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null
  }

  return {
    ownerIdentifier: parts[0],
    projectName: parts[1],
    filePath: parts.slice(2).join('/') || '',
  }
}
