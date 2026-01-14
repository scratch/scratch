import log from '../../logger'
import { createShareToken, listShareTokens, revokeShareToken, ApiError } from '../../cloud/api'
import { shareTokenDurations, type ShareTokenDuration } from '@scratch/shared/api'
import { resolveProjectOrConfig, formatDateTime } from './projects'
import { prompt, select, stripTrailingSlash } from '../../util'
import { CloudContext } from './context'

// Format duration for display
function formatDuration(duration: ShareTokenDuration): string {
  switch (duration) {
    case '1d':
      return '1 day'
    case '1w':
      return '1 week'
    case '1m':
      return '1 month'
    default:
      return duration
  }
}

// Common error handler for share token API errors
function handleApiError(error: ApiError, projectName: string, tokenId?: string): never {
  const body = error.body as any
  if (error.status === 403 && body?.code === 'SHARE_TOKENS_DISABLED') {
    log.error('Share tokens are disabled on this server')
  } else if (error.status === 400 && body?.code === 'SHARE_TOKEN_LIMIT_EXCEEDED') {
    log.error('Maximum number of active share tokens reached (10)')
  } else if (error.status === 404) {
    if (body?.code === 'SHARE_TOKEN_NOT_FOUND' && tokenId) {
      log.error(`Share token "${tokenId}" not found`)
    } else {
      log.error(`Project "${projectName}" not found`)
    }
  } else {
    log.error(body?.error || error.message)
  }
  process.exit(1)
}

export interface ShareOptions {
  duration?: string
  name?: string
}

export async function shareCreateCommand(
  ctx: CloudContext,
  identifier?: string,
  options: ShareOptions = {}
): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await ctx.requireAuth()
  const projectName = await resolveProjectOrConfig(credentials.token, identifier, serverUrl)

  // Get or prompt for token name
  let tokenName = options.name
  if (!tokenName) {
    tokenName = await prompt('Token name (e.g., "client-review"): ')
    if (!tokenName) {
      log.error('Token name is required')
      process.exit(1)
    }
  }

  // Get or prompt for duration
  let duration: ShareTokenDuration
  if (options.duration) {
    if (!shareTokenDurations.includes(options.duration as ShareTokenDuration)) {
      log.error(`Invalid duration. Must be one of: ${shareTokenDurations.join(', ')}`)
      process.exit(1)
    }
    duration = options.duration as ShareTokenDuration
  } else {
    const durationChoices = [
      { name: '1 day', value: '1d' as ShareTokenDuration },
      { name: '1 week', value: '1w' as ShareTokenDuration },
      { name: '1 month', value: '1m' as ShareTokenDuration },
    ]
    duration = await select('Choose token duration:', durationChoices, '1w' as ShareTokenDuration)
  }

  try {
    const result = await createShareToken(
      credentials.token,
      projectName,
      tokenName,
      duration,
      serverUrl
    )

    log.info('')
    log.info(`Created share token for ${projectName}`)
    log.info('')
    log.info(`  Name:    ${result.share_token.name}`)
    log.info(`  Expires: ${formatDateTime(result.share_token.expires_at)} (${formatDuration(duration)})`)
    log.info('')
    log.info('Share URL (copy this - token is shown only once):')
    log.info('')
    log.info(`  ${stripTrailingSlash(result.share_url)}`)
    log.info('')
  } catch (error) {
    if (error instanceof ApiError) {
      handleApiError(error, projectName)
    }
    throw error
  }
}

export async function shareListCommand(
  ctx: CloudContext,
  identifier?: string
): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await ctx.requireAuth()
  const projectName = await resolveProjectOrConfig(credentials.token, identifier, serverUrl)

  try {
    const { share_tokens } = await listShareTokens(
      credentials.token,
      projectName,
      serverUrl
    )

    if (share_tokens.length === 0) {
      log.info('')
      log.info(`No share tokens for ${projectName}`)
      log.info('Create one with `scratch cloud share <project>`')
      return
    }

    log.info('')
    log.info(`Share tokens for ${projectName}:`)
    log.info('')

    for (const token of share_tokens) {
      let status: string
      if (token.is_revoked) {
        status = 'revoked'
      } else if (token.is_expired) {
        status = 'expired'
      } else {
        status = 'active'
      }

      const statusLabel = status === 'active' ? '' : ` (${status})`
      log.info(`  ${token.id}  ${token.name}  ${formatDuration(token.duration)}${statusLabel}`)
      log.info(`    Created: ${formatDateTime(token.created_at)}`)
      log.info(`    Expires: ${formatDateTime(token.expires_at)}`)
      if (token.revoked_at) {
        log.info(`    Revoked: ${formatDateTime(token.revoked_at)}`)
      }
      log.info('')
    }

    const activeCount = share_tokens.filter((t) => t.is_active).length
    log.info(`${share_tokens.length} token${share_tokens.length === 1 ? '' : 's'} (${activeCount} active)`)
  } catch (error) {
    if (error instanceof ApiError) {
      handleApiError(error, projectName)
    }
    throw error
  }
}

export async function shareRevokeCommand(
  ctx: CloudContext,
  tokenId: string,
  identifier?: string
): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await ctx.requireAuth()
  const projectName = await resolveProjectOrConfig(credentials.token, identifier, serverUrl)

  try {
    const { share_token } = await revokeShareToken(
      credentials.token,
      projectName,
      tokenId,
      serverUrl
    )

    log.info('')
    log.info(`Revoked share token "${share_token.name}" for ${projectName}`)
  } catch (error) {
    if (error instanceof ApiError) {
      handleApiError(error, projectName, tokenId)
    }
    throw error
  }
}
