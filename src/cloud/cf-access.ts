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

  if (!config.cf_access_client_id || !config.cf_access_client_secret) {
    return undefined
  }

  return {
    'CF-Access-Client-Id': config.cf_access_client_id,
    'CF-Access-Client-Secret': config.cf_access_client_secret,
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
