import { createAuthClient } from 'better-auth/client'
import { deviceAuthorizationClient } from 'better-auth/client/plugins'
import log from '../logger'

// Redact sensitive values, showing only first 2 characters
function redact(value: string): string {
  if (value.length <= 2) return '**'
  return value.slice(0, 2) + '**'
}

// Convert various header formats to a plain object
function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const obj: Record<string, string> = {}
    headers.forEach((value, key) => {
      obj[key] = value
    })
    return obj
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return headers as Record<string, string>
}

// Create a fetch wrapper that logs requests/responses
function createLoggingFetch(extraHeaders?: Record<string, string>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method || 'GET'

    // Merge headers - convert init.headers which may be Headers object
    const headers: Record<string, string> = {
      ...(extraHeaders || {}),
      ...headersToObject(init?.headers),
    }

    // Log request with redacted headers
    const redactedHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'authorization') {
        const parts = value.split(' ')
        redactedHeaders[key] = parts.length === 2 ? `${parts[0]} ${redact(parts[1])}` : redact(value)
      } else if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
        redactedHeaders[key] = redact(value)
      } else {
        redactedHeaders[key] = value
      }
    }
    log.debug(`→ ${method} ${url}`)
    log.debug(`  headers: ${JSON.stringify(redactedHeaders)}`)

    const response = await fetch(input, { ...init, headers })

    // Log response
    log.debug(`← ${response.status} ${response.statusText} [${response.headers.get('content-type') || 'no content-type'}]`)

    return response
  }
}

/**
 * Create a BetterAuth client for device authorization flow.
 *
 * @param baseURL - The server URL (e.g., "https://app.scratch.example.com")
 * @param headers - Optional headers (e.g., CF Access headers)
 */
export function createBetterAuthClient(baseURL: string, headers?: Record<string, string>) {
  // CLI requests need an Origin header to pass BetterAuth's CSRF protection.
  // BetterAuth validates Origin against trustedOrigins for all non-GET requests.
  const allHeaders = {
    Origin: baseURL,
    ...headers,
  }

  return createAuthClient({
    baseURL,
    basePath: '/auth',  // Must match server's basePath
    plugins: [deviceAuthorizationClient()],
    fetchOptions: {
      customFetchImpl: createLoggingFetch(allHeaders),
    },
  })
}

export type BetterAuthClient = ReturnType<typeof createBetterAuthClient>
