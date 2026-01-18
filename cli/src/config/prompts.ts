/**
 * Unified prompting API for user and project configuration.
 *
 * All prompts use existing values as defaults, falling back to global defaults.
 */

import log from '../logger'
import { prompt, select, confirm, type SelectChoice } from '../util'
import { validateProjectName, getEmailDomain } from '@scratch/shared/project'
import { validateGroupInput } from '@scratch/shared'
import { DEFAULT_SERVER_URL } from './paths'

// ============================================================================
// Server URL (User Config)
// ============================================================================

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
 * Validate a server URL string.
 * Returns error message if invalid, null if valid.
 */
export function validateServerUrl(url: string): string | null {
  try {
    new URL(url)
  } catch {
    return `Invalid URL: ${url}`
  }

  // Enforce HTTPS for non-localhost URLs
  if (!url.startsWith('https://') && !url.includes('localhost')) {
    return 'Server URL must use HTTPS (except for localhost)'
  }

  return null
}

/**
 * Normalize a server URL input from user:
 * - Add https:// if no protocol specified (http:// for localhost)
 * - Add app. subdomain if naked domain
 * Returns { url, modified } where modified is true if app. subdomain was added
 * (adding https:// is considered a silent fix, not a modification to report)
 */
export function normalizeServerUrlInput(url: string): { url: string; modified: boolean } {
  let modified = false

  // Add https:// if no protocol specified (silent fix, doesn't set modified)
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
 * Prompt for server URL with validation and normalization.
 *
 * @param currentValue - Current configured value (if any)
 * @returns The validated and normalized server URL
 */
export async function promptServerUrl(currentValue?: string): Promise<string> {
  const defaultValue = currentValue || DEFAULT_SERVER_URL

  while (true) {
    const answer = await prompt('Server URL', defaultValue)

    // Normalize: add https:// and app. subdomain if needed
    const { url, modified } = normalizeServerUrlInput(answer)

    const error = validateServerUrl(url)
    if (error) {
      log.error(error)
      continue
    }

    if (modified) {
      log.info(`Using ${url}`)
    }

    return url
  }
}

// ============================================================================
// Project Name (Project Config)
// ============================================================================

/**
 * Derive a default project name from directory name.
 * Converts to lowercase, replaces invalid chars with hyphens.
 */
export function deriveProjectName(dirName: string): string {
  return dirName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-') // Collapse multiple hyphens
    || 'my-project' // Fallback if empty after sanitization
}

/**
 * Prompt for project name with validation.
 *
 * @param currentValue - Current configured value (if any)
 * @param dirName - Directory name to derive default from (if no current value)
 * @returns The validated project name
 */
export async function promptProjectName(
  currentValue?: string,
  dirName?: string
): Promise<string> {
  const defaultValue = currentValue || (dirName ? deriveProjectName(dirName) : '')

  while (true) {
    const answer = await prompt('Project name', defaultValue)

    if (!answer) {
      log.error('Project name is required')
      continue
    }

    const validation = validateProjectName(answer)
    if (!validation.valid) {
      log.error(validation.error || 'Invalid project name')
      continue
    }

    return answer
  }
}

// ============================================================================
// Visibility (Project Config)
// ============================================================================

/**
 * Prompt for visibility selection.
 * Offers private, public, domain-based, and custom options.
 *
 * @param userEmail - User's email address (to derive domain option)
 * @param currentValue - Current configured value (if any)
 * @returns The selected visibility
 */
export async function promptVisibility(
  userEmail: string,
  currentValue?: string
): Promise<string> {
  const userDomain = getEmailDomain(userEmail)
  const defaultValue = currentValue || 'private'

  // Build choices
  const choices: SelectChoice<string>[] = [
    { name: 'private (only you)', value: 'private' },
    { name: 'public (anyone with the URL)', value: 'public' },
  ]

  // Add domain option if user has one
  if (userDomain) {
    choices.push({
      name: `@${userDomain} (anyone at ${userDomain})`,
      value: `@${userDomain}`,
    })
  }

  // If current value is custom (not private, public, or domain), show it as an option
  const isCustomVisibility = currentValue &&
    currentValue !== 'private' &&
    currentValue !== 'public' &&
    currentValue !== `@${userDomain}`

  if (isCustomVisibility) {
    choices.push({
      name: `${currentValue} (current)`,
      value: currentValue,
    })
  }

  // Always add "custom" option
  choices.push({
    name: 'Share with specific people...',
    value: '__custom__',
  })

  const selected = await select('Visibility:', choices, defaultValue)

  // Handle custom visibility selection
  if (selected === '__custom__') {
    return promptCustomVisibility('')
  }

  // Handle editing current custom visibility
  if (selected === currentValue && isCustomVisibility) {
    const edit = await confirm('Edit current visibility?', true)
    if (edit) {
      return promptCustomVisibility(currentValue)
    }
  }

  return selected
}

/**
 * Prompt for custom visibility (comma-separated emails/@domains).
 *
 * @param currentValue - Current value to pre-fill
 * @returns The validated custom visibility string
 */
export async function promptCustomVisibility(currentValue: string): Promise<string> {
  while (true) {
    const answer = await prompt('Enter emails and/or @domains (comma-separated)', currentValue)

    if (!answer) {
      log.error('Visibility is required')
      continue
    }

    const error = validateGroupInput(answer)
    if (error) {
      log.error(error)
      continue
    }

    return answer
  }
}

// ============================================================================
// Server Selection (for commands that need to choose a server)
// ============================================================================

import { getLoggedInServers } from './credentials'

/**
 * Resolve which server to use.
 *
 * Priority:
 * 1. If serverUrlArg is provided (from CLI argument), use it
 * 2. If logged into exactly one server, use it automatically
 * 3. If logged into multiple servers, prompt user to choose
 * 4. If not logged into any server, use default
 *
 * @param serverUrlArg - Optional server URL from CLI argument
 * @returns The resolved server URL
 */
export async function resolveServerUrl(serverUrlArg?: string): Promise<string> {
  // If explicit server URL provided, normalize and return it
  if (serverUrlArg) {
    const { url, modified } = normalizeServerUrlInput(serverUrlArg)
    if (modified) {
      log.info(`Using ${url}`)
    }
    return url
  }

  // Check how many servers we're logged into
  const loggedInServers = await getLoggedInServers()

  if (loggedInServers.length === 0) {
    // Not logged in anywhere - use default
    return DEFAULT_SERVER_URL
  }

  if (loggedInServers.length === 1) {
    // Logged into exactly one server - use it automatically
    return loggedInServers[0]!
  }

  // Multiple servers - prompt user to choose
  // Strip https:// for cleaner display
  const stripProtocol = (url: string) => url.replace(/^https?:\/\//, '')

  const choices: SelectChoice<string>[] = loggedInServers.map(url => ({
    name: stripProtocol(url),
    value: url,
  }))

  // Add option to enter a different URL
  choices.push({
    name: 'other...',
    value: '__other__',
  })

  const selected = await select('Select server:', choices, loggedInServers[0]!)

  if (selected === '__other__') {
    return promptServerUrl()
  }

  return selected
}

// ============================================================================
// Re-export constants for convenience
// ============================================================================

export { DEFAULT_SERVER_URL } from './paths'
