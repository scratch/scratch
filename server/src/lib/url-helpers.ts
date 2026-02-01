/**
 * URL building helpers to reduce manual URL construction with encodeURIComponent.
 */

/**
 * Build an error redirect URL with properly encoded message.
 */
export function errorRedirectUrl(message: string): string {
  return '/error?message=' + encodeURIComponent(message)
}

/**
 * Build a localhost callback URL for CLI authentication flows.
 * @param port The localhost port number
 * @param params Optional query parameters to include
 */
export function buildLocalhostCallbackUrl(port: number, params?: Record<string, string>): string {
  const url = new URL(`http://localhost:${port}/callback`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  return url.toString()
}
