import { createAuthClient } from 'better-auth/client'
import { deviceAuthorizationClient } from 'better-auth/client/plugins'

/**
 * Create a BetterAuth client for device authorization flow.
 *
 * @param baseURL - The server URL (e.g., "https://app.scratch.example.com")
 * @param headers - Optional headers (e.g., CF Access headers)
 */
export function createBetterAuthClient(baseURL: string, headers?: Record<string, string>) {
  return createAuthClient({
    baseURL,
    basePath: '/auth',  // Must match server's basePath
    plugins: [deviceAuthorizationClient()],
    fetchOptions: headers ? { headers } : undefined,
  })
}

export type BetterAuthClient = ReturnType<typeof createBetterAuthClient>
