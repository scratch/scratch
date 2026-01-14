/**
 * HTTP request utilities for the Scratch Cloud API.
 * Handles authentication headers, CF Access tokens, timeouts, and error handling.
 */

import { getServerUrl, getCfAccessHeaders, isCfAccessDenied, isCfAccessAuthPage, loadCredentials } from '../config'
import log from '../logger'

// =============================================================================
// Error class
// =============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// =============================================================================
// Request logging
// =============================================================================

function redact(value: string): string {
  if (value.length <= 2) return '**'
  return value.slice(0, 2) + '**'
}

function logRequest(method: string, url: string, headers: Record<string, string>, bodySize?: number): void {
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
  const bodyInfo = bodySize !== undefined ? ` [${bodySize} bytes]` : ''
  log.debug(`-> ${method} ${url}${bodyInfo}`)
  log.debug(`  headers: ${JSON.stringify(redactedHeaders)}`)
}

function logResponse(status: number, statusText: string, contentType: string | null): void {
  log.debug(`<- ${status} ${statusText} [${contentType || 'no content-type'}]`)
}

// =============================================================================
// Core request utility
// =============================================================================

export const DEFAULT_TIMEOUT = 30000 // 30 seconds

export interface RequestOptions {
  method?: string
  body?: BodyInit
  contentType?: string
  token?: string
  serverUrl?: string
  timeout?: number
}

/**
 * Handle CF Access authentication issues by prompting for credentials.
 */
async function handleCfAccessAuth(serverUrl: string, hadCredentials: boolean): Promise<void> {
  if (hadCredentials) {
    log.info('Cloudflare Access token expired. Please update your credentials.')
  } else {
    log.info('This server requires Cloudflare Access authentication.')
  }

  // Dynamically import to avoid circular dependencies
  const { CloudContext } = await import('../cmd/cloud/context')
  const { cfAccessCommand } = await import('../cmd/cloud/auth')
  const ctx = new CloudContext({ serverUrl })
  await cfAccessCommand(ctx)

  log.info('Credentials saved. Retrying request...')
}

/**
 * Build headers for an API request, including auth and CF Access tokens.
 */
async function buildHeaders(
  serverUrl: string,
  token?: string,
  contentType?: string
): Promise<{ headers: Record<string, string>; hasCfAccess: boolean }> {
  // Start with CF Access service token headers if configured
  const cfHeaders = await getCfAccessHeaders(serverUrl)
  const headers: Record<string, string> = { ...(cfHeaders || {}) }

  // Set content type
  if (contentType) {
    headers['Content-Type'] = contentType
  }

  // Add Bearer token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Add CF Access JWT from credentials (browser-based CF Access auth)
  const credentials = await loadCredentials(serverUrl)
  if (credentials?.cfToken) {
    headers['cf-access-token'] = credentials.cfToken
  }

  return { headers, hasCfAccess: cfHeaders !== undefined }
}

/**
 * Make an API request with automatic header handling and CF Access retry.
 * 
 * @param path - API path (e.g., '/api/me')
 * @param options - Request options
 * @returns Parsed JSON response, or void for 204 responses
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
  _isRetry = false
): Promise<T> {
  const serverUrl = options.serverUrl || await getServerUrl()
  const url = `${serverUrl}${path}`
  const timeout = options.timeout || DEFAULT_TIMEOUT
  const contentType = options.contentType || 'application/json'

  const { headers, hasCfAccess } = await buildHeaders(serverUrl, options.token, contentType)

  // Log request
  const bodySize = options.body instanceof ArrayBuffer ? options.body.byteLength : undefined
  logRequest(options.method || 'GET', url, headers, bodySize)

  // Execute request with timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
    })
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out', 0)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  logResponse(response.status, response.statusText, response.headers.get('content-type'))

  // Handle errors
  if (!response.ok) {
    if (isCfAccessDenied(response)) {
      throw new ApiError('Cloudflare Access denied. Run: scratch cloud cf-access', 403)
    }

    const text = await response.text()
    log.debug(`Response body (first 500 chars): ${text.slice(0, 500)}`)

    // Retry on CF Access auth page
    if (!_isRetry && isCfAccessAuthPage(response, text)) {
      await handleCfAccessAuth(serverUrl, hasCfAccess)
      return request<T>(path, options, true)
    }

    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // Keep as text
    }

    const errorMessage = typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : `Request failed: ${response.status} ${response.statusText}`

    throw new ApiError(errorMessage, response.status, body)
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return undefined as T
  }

  // Parse JSON response
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    log.debug(`Failed to parse JSON. Content-type: ${response.headers.get('content-type')}`)
    log.debug(`Response body (first 500 chars): ${text.slice(0, 500)}`)

    // Retry on CF Access auth page (HTML instead of expected JSON)
    if (!_isRetry && isCfAccessAuthPage(response, text)) {
      await handleCfAccessAuth(serverUrl, hasCfAccess)
      return request<T>(path, options, true)
    }

    throw new ApiError('Failed to parse JSON response', response.status, text)
  }
}
