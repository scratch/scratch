// Runtime validation for auth mode requirements
// Ensures required environment variables are set for the configured auth mode

import type { Env } from '../env'

/**
 * Check if a value is effectively unset (empty or placeholder).
 * The `_` placeholder is used for optional auth variables when the mode doesn't require them.
 */
function isUnset(value: string | undefined): boolean {
  return !value || value === '' || value === '_'
}

/**
 * Validate environment variables for the configured auth mode.
 * Call this at startup to provide clear error messages if required vars are missing.
 *
 * Throws an error if validation fails.
 */
export function validateEnvForAuthMode(env: Env): void {
  const errors: string[] = []

  // BETTER_AUTH_SECRET is always required (device flow tokens)
  if (isUnset(env.BETTER_AUTH_SECRET)) {
    errors.push('BETTER_AUTH_SECRET is required')
  }

  if (env.AUTH_MODE === 'cloudflare-access') {
    // Cloudflare Access mode
    if (isUnset(env.CLOUDFLARE_ACCESS_TEAM)) {
      errors.push('CLOUDFLARE_ACCESS_TEAM is required when AUTH_MODE=cloudflare-access')
    }
  } else {
    // Local mode (default) - uses BetterAuth with Google OAuth
    if (isUnset(env.GOOGLE_CLIENT_ID)) {
      errors.push('GOOGLE_CLIENT_ID is required when AUTH_MODE=local')
    }
    if (isUnset(env.GOOGLE_CLIENT_SECRET)) {
      errors.push('GOOGLE_CLIENT_SECRET is required when AUTH_MODE=local')
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n  - ${errors.join('\n  - ')}`)
  }
}
