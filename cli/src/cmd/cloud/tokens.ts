/**
 * API Token management commands.
 *
 * API tokens provide non-interactive authentication for CI/CD and automation.
 * Unlike session tokens from device authorization, API tokens:
 * - Are created via CLI or API (no browser required)
 * - Can have optional expiration
 * - Use X-Api-Key header (not Authorization: Bearer)
 */

import log from '../../logger'
import { request, ApiError } from '../../cloud/request'
import {
  saveCredentials,
  loadCredentials,
} from '../../config/credentials'
import {
  normalizeServerUrlInput,
  promptServerUrlSelection,
} from '../../config/prompts'
import { CloudContext } from './context'
import { formatRelativeTime } from './util'

// =============================================================================
// Types
// =============================================================================

interface ApiKeyResponse {
  id: string
  name: string | null
  start: string  // First few chars for display
  prefix: string | null
  enabled: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  lastRequest: string | null  // Last time the token was used
}

interface ApiKeyCreateResponse {
  key: string  // Full key (only returned on creation)
  id: string
  name: string | null
  start: string
  prefix: string | null
  enabled: boolean
  expiresAt: string | null
  createdAt: string
}

// Better Auth returns a direct array from the list endpoint
type ApiKeyListResponse = ApiKeyResponse[]

// Maximum token expiration in days (enforced by BetterAuth server-side)
const MAX_EXPIRATION_DAYS = 365

// =============================================================================
// List Tokens
// =============================================================================

export async function listTokensCommand(ctx: CloudContext): Promise<void> {
  const credentials = await ctx.requireAuth()
  const serverUrl = await ctx.getServerUrl()

  const tokens = await request<ApiKeyListResponse>('/auth/api-key/list', {
    token: credentials.token,
    serverUrl,
  })

  if (tokens.length === 0) {
    log.info('No API tokens found.')
    log.info('')
    log.info('Create one with: scratch tokens create <name>')
    return
  }

  log.info('API Tokens:')
  log.info('')

  for (const token of tokens) {
    const expires = token.expiresAt
      ? `expires ${new Date(token.expiresAt).toLocaleDateString()}`
      : 'no expiration'
    const status = token.enabled ? '' : ' (disabled)'
    const lastUsed = token.lastRequest
      ? `Last used: ${formatRelativeTime(new Date(token.lastRequest))}`
      : 'Never used'

    log.info(`  ${token.name || '(unnamed)'}${status}`)
    log.info(`    ID: ${token.id}`)
    log.info(`    Preview: ${token.start}...`)
    log.info(`    Created: ${new Date(token.createdAt).toLocaleDateString()}, ${expires}`)
    log.info(`    ${lastUsed}`)
    log.info('')
  }
}

// =============================================================================
// Create Token
// =============================================================================

export interface CreateTokenOptions {
  expires?: number  // Days until expiration
}

export async function createTokenCommand(
  ctx: CloudContext,
  name: string,
  options: CreateTokenOptions
): Promise<void> {
  // Validate token name
  if (name.length < 3 || name.length > 40) {
    throw new Error('Token name must be 3-40 characters')
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Token name can only contain letters, numbers, hyphens, and underscores')
  }

  // Validate expiration (server enforces max, but provide clear client-side error)
  if (options.expires && options.expires > MAX_EXPIRATION_DAYS) {
    throw new Error(`Token expiration cannot exceed ${MAX_EXPIRATION_DAYS} days`)
  }

  const credentials = await ctx.requireAuth()
  const serverUrl = await ctx.getServerUrl()

  // Check for duplicate token name
  const existingTokens = await request<ApiKeyListResponse>('/auth/api-key/list', {
    token: credentials.token,
    serverUrl,
  })
  if (existingTokens.some(t => t.name === name)) {
    throw new Error(`A token named "${name}" already exists. Use a different name or revoke the existing token first.`)
  }

  const body: Record<string, unknown> = { name }

  if (options.expires) {
    // expiresIn is in seconds for Better Auth
    body.expiresIn = options.expires * 24 * 60 * 60
  }

  const response = await request<ApiKeyCreateResponse>('/auth/api-key/create', {
    method: 'POST',
    body: JSON.stringify(body),
    token: credentials.token,
    serverUrl,
  })

  log.info('')
  log.info(`Created API token: ${name}`)
  log.info('')
  log.info(`  ${response.key}`)
  log.info('')
  log.info('! Copy this token now. It will not be shown again.')
  if (!options.expires) {
    log.info('  Tip: Use --expires <days> for CI tokens to limit exposure if leaked')
  }
  log.info('')
  log.info('Usage:')
  log.info('  # Option 1: Environment variable (CI/CD)')
  log.info('  export SCRATCH_TOKEN=<token>')
  log.info('')
  log.info('  # Option 2: Project .env file')
  log.info('  echo "SCRATCH_TOKEN=<token>" >> .env')
  log.info('')
  log.info('  # Option 3: Store in credentials file')
  log.info('  scratch tokens use <token>')
}

// =============================================================================
// Revoke Token
// =============================================================================

export async function revokeTokenCommand(
  ctx: CloudContext,
  idOrName: string
): Promise<void> {
  const credentials = await ctx.requireAuth()
  const serverUrl = await ctx.getServerUrl()

  // First, list tokens to find by name if needed
  const tokens = await request<ApiKeyListResponse>('/auth/api-key/list', {
    token: credentials.token,
    serverUrl,
  })

  const token = tokens.find(t => t.id === idOrName || t.name === idOrName)

  if (!token) {
    throw new Error(`Token not found: ${idOrName}`)
  }

  await request<void>('/auth/api-key/delete', {
    method: 'POST',
    body: JSON.stringify({ keyId: token.id }),
    token: credentials.token,
    serverUrl,
  })

  log.info(`Revoked token: ${token.name || token.id}`)
}

// =============================================================================
// Use Token (store in credentials file)
// =============================================================================

export interface UseTokenOptions {
  server?: string  // Server URL override
  force?: boolean  // Replace existing credential without prompting
}

export async function useTokenCommand(
  apiToken: string,
  options: UseTokenOptions
): Promise<void> {
  // Validate token format
  if (!apiToken.startsWith('scratch_')) {
    throw new Error('Invalid token format. API tokens start with "scratch_"')
  }

  // Determine server URL
  const serverUrl = options.server
    ? normalizeServerUrlInput(options.server).url
    : await promptServerUrlSelection()

  // Check for existing credential
  const existing = await loadCredentials(serverUrl)
  if (existing && !options.force) {
    const existingType = existing.type === 'api_key' ? 'API token' : 'session'
    log.info(`You already have a ${existingType} stored for ${serverUrl}`)
    log.info(`  Authenticated as: ${existing.user.email}`)
    log.info('')
    log.info('To replace it, run:')
    log.info(`  scratch tokens use ${apiToken.slice(0, 12)}... --force`)
    return
  }

  // Validate the token by making a test request
  let user: { user: { id: string; email: string; name: string | null } }
  try {
    user = await request<{ user: { id: string; email: string; name: string | null } }>('/api/me', {
      apiKey: apiToken,
      serverUrl,
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new Error('Invalid or expired token')
    }
    throw error
  }

  // Save to credentials file
  await saveCredentials({
    token: apiToken,
    type: 'api_key',
    user: {
      id: user.user.id,
      email: user.user.email,
      name: user.user.name,
    },
  }, serverUrl)

  if (existing) {
    const existingType = existing.type === 'api_key' ? 'API token' : 'session'
    log.info(`Replaced ${existingType} with new API token for ${serverUrl}`)
  } else {
    log.info(`Saved API token for ${serverUrl}`)
  }
  log.info(`Authenticated as: ${user.user.email}`)
}
