import { getCfAccessCredentials } from './user-secrets'

export interface CfAccessHeaders {
  'CF-Access-Client-Id': string
  'CF-Access-Client-Secret': string
}

/**
 * Get CF Access headers if a service token is configured.
 * Returns undefined if no token is configured.
 */
export async function getCfAccessHeaders(): Promise<CfAccessHeaders | undefined> {
  const credentials = await getCfAccessCredentials()

  if (!credentials) {
    return undefined
  }

  return {
    'CF-Access-Client-Id': credentials.clientId,
    'CF-Access-Client-Secret': credentials.clientSecret,
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

/**
 * Check if a response is a CF Access authentication page.
 * Cloudflare returns an HTML login page when:
 * - Service tokens are expired/invalid
 * - No CF Access credentials were provided but the server requires them
 * This detects that case by checking for HTML content with CF Access indicators.
 */
export function isCfAccessAuthPage(response: Response, responseText: string): boolean {
  // Only check for non-OK responses that are HTML
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    return false
  }

  // Look for CF Access-specific indicators in the HTML
  // These strings appear in the Cloudflare Access login/authentication page
  const cfAccessIndicators = [
    'cloudflareaccess',
    'cf-access',
    'access.cloudflare',
    'Access-Jwt-Assertion',
    'CF_Authorization',
    'cloudflare-static',
  ]

  const lowerText = responseText.toLowerCase()
  return cfAccessIndicators.some(indicator => lowerText.includes(indicator.toLowerCase()))
}
