import { loadUserConfig } from './user-config'

export interface CfAccessHeaders {
  'CF-Access-Client-Id': string
  'CF-Access-Client-Secret': string
}

/**
 * Get CF Access headers if a service token is configured.
 * Returns undefined if no token is configured.
 */
export async function getCfAccessHeaders(): Promise<CfAccessHeaders | undefined> {
  const config = await loadUserConfig()

  if (!config.cf_access_token) {
    return undefined
  }

  // Split on first colon only (secret may contain colons)
  const colonIndex = config.cf_access_token.indexOf(':')
  if (colonIndex === -1) {
    return undefined
  }

  const clientId = config.cf_access_token.slice(0, colonIndex)
  const clientSecret = config.cf_access_token.slice(colonIndex + 1)

  if (!clientId || !clientSecret) {
    return undefined
  }

  return {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  }
}

/**
 * Check if a response is a CF Access denial.
 * Only returns true for 403 responses with clear CF Access indicators.
 */
export function isCfAccessDenied(response: Response): boolean {
  if (response.status !== 403) {
    return false
  }

  // CF Access sets this header when it blocks a request
  return response.headers.has('cf-mitigated')
}
