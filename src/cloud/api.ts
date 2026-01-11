import { getServerUrl, getCfAccessHeaders, isCfAccessDenied, isCfAccessAuthPage } from '../config'
import log from '../logger'
import type {
  UserResponse,
  ProjectListResponse,
  ProjectResponse,
  DeployListResponse,
  DeployCreateResponse,
  DeployCreateParams,
  ShareTokenDuration,
  ShareTokenCreateResponse,
  ShareTokenListResponse,
  ShareTokenResponse,
} from './types'

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

const DEFAULT_TIMEOUT = 30000 // 30 seconds

/**
 * Handle CF Access authentication issues by prompting for credentials.
 * @param serverUrl - The server URL to configure CF Access for
 * @param hadCredentials - Whether CF Access credentials were configured before the request
 * Returns true if credentials were set/refreshed and request should be retried.
 */
async function handleCfAccessAuth(serverUrl: string, hadCredentials: boolean): Promise<boolean> {
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
  return true
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  serverUrlOverride?: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
  _isRetry: boolean = false
): Promise<T> {
  const serverUrl = serverUrlOverride || await getServerUrl()
  const url = `${serverUrl}${path}`

  // Include CF Access headers if configured (keyed by server URL)
  const cfHeaders = await getCfAccessHeaders(serverUrl)
  const headers: Record<string, string> = {
    ...(cfHeaders || {}),
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Log request details
  log.debug(`API request: ${options.method || 'GET'} ${url}`)
  log.debug(`CF Access headers configured: ${cfHeaders ? 'yes' : 'no'}`)
  if (cfHeaders) {
    log.debug(`CF-Access-Client-Id: ${cfHeaders['CF-Access-Client-Id'].slice(0, 8)}...`)
    log.debug(`CF-Access-Client-Secret: ${cfHeaders['CF-Access-Client-Secret'].slice(0, 4)}...`)
  }
  log.debug(`Request headers: ${Object.keys(headers).join(', ')}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    })
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out', 0)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  // Log response details
  log.debug(`Response status: ${response.status}`)
  log.debug(`Response content-type: ${response.headers.get('content-type')}`)

  if (!response.ok) {
    // Check for CF Access denial before reading body
    if (isCfAccessDenied(response)) {
      throw new ApiError(
        `Cloudflare Access denied. Run: scratch cloud cf-access`,
        403
      )
    }

    // Read as text first, then try to parse as JSON
    const text = await response.text()
    log.debug(`Response body (first 500 chars): ${text.slice(0, 500)}`)

    // Check for CF Access auth page (HTML response with CF Access indicators)
    if (!_isRetry && isCfAccessAuthPage(response, text)) {
      await handleCfAccessAuth(serverUrl, cfHeaders !== undefined)
      // Retry the request with new credentials
      return request<T>(path, options, token, serverUrlOverride, timeoutMs, true)
    }

    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // Keep as text
    }
    throw new ApiError(
      `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      body
    )
  }

  // Read response as text first to enable logging on parse failure
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    log.debug(`Failed to parse JSON response. Content-type: ${response.headers.get('content-type')}`)
    log.debug(`Response body (first 500 chars): ${text.slice(0, 500)}`)

    // Check for CF Access auth page (HTML response instead of expected JSON)
    if (!_isRetry && isCfAccessAuthPage(response, text)) {
      await handleCfAccessAuth(serverUrl, cfHeaders !== undefined)
      // Retry the request with new credentials
      return request<T>(path, options, token, serverUrlOverride, timeoutMs, true)
    }

    throw new ApiError('Failed to parse JSON', response.status, text)
  }
}

// Get current user info
export async function getCurrentUser(token: string, serverUrl?: string): Promise<UserResponse> {
  return request<UserResponse>('/api/me', {}, token, serverUrl)
}

// List projects
export async function listProjects(token: string, serverUrl?: string): Promise<ProjectListResponse> {
  return request<ProjectListResponse>('/api/projects', {}, token, serverUrl)
}

// Get single project
export async function getProject(
  token: string,
  name: string,
  namespace?: string | null,
  serverUrl?: string
): Promise<ProjectResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ProjectResponse>(`/api/projects/${encodeURIComponent(name)}${query}`, {}, token, serverUrl)
}

// Delete project
export async function deleteProject(
  token: string,
  name: string,
  namespace?: string | null,
  serverUrlOverride?: string,
  _isRetry: boolean = false
): Promise<void> {
  const serverUrl = serverUrlOverride || await getServerUrl()
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  const url = `${serverUrl}/api/projects/${encodeURIComponent(name)}${query}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

  // Include CF Access headers if configured (keyed by server URL)
  const cfHeaders = await getCfAccessHeaders(serverUrl)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...(cfHeaders || {}),
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    })
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out', 0)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    // Check for CF Access denial before reading body
    if (isCfAccessDenied(response)) {
      throw new ApiError(
        `Cloudflare Access denied. Run: scratch cloud cf-access`,
        403
      )
    }

    const text = await response.text()

    // Check for CF Access auth page
    if (!_isRetry && isCfAccessAuthPage(response, text)) {
      await handleCfAccessAuth(serverUrl, cfHeaders !== undefined)
      return deleteProject(token, name, namespace, serverUrlOverride, true)
    }

    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // Keep as text
    }
    throw new ApiError(`Delete failed: ${response.status}`, response.status, body)
  }
}

// List deploys for a project
export async function listDeploys(
  token: string,
  name: string,
  namespace?: string | null,
  serverUrl?: string
): Promise<DeployListResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<DeployListResponse>(
    `/api/projects/${encodeURIComponent(name)}/deploys${query}`,
    {},
    token,
    serverUrl
  )
}

// Deploy a project (upload zip)
// See DeployCreateParams in shared/src/api/deploys.ts for parameter types
const DEPLOY_TIMEOUT = 120000 // 2 minutes for file uploads

export async function deploy(
  token: string,
  params: DeployCreateParams,
  zipData: ArrayBuffer,
  serverUrlOverride?: string,
  _isRetry: boolean = false
): Promise<DeployCreateResponse> {
  const serverUrl = serverUrlOverride || await getServerUrl()

  // Build query string from params
  const queryParams = new URLSearchParams()
  if (params.namespace) {
    queryParams.set('namespace', params.namespace)
  }
  if (params.visibility) {
    queryParams.set('visibility', params.visibility)
  }
  const query = queryParams.toString() ? `?${queryParams.toString()}` : ''

  const url = `${serverUrl}/api/projects/${encodeURIComponent(params.name)}/deploy${query}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEPLOY_TIMEOUT)

  // Include CF Access headers if configured (keyed by server URL)
  const cfHeaders = await getCfAccessHeaders(serverUrl)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        ...(cfHeaders || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/zip',
      },
      body: zipData,
      signal: controller.signal,
    })
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new ApiError('Deploy timed out', 0)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    // Check for CF Access denial before reading body
    if (isCfAccessDenied(response)) {
      throw new ApiError(
        `Cloudflare Access denied. Run: scratch cloud cf-access`,
        403
      )
    }

    const text = await response.text()

    // Check for CF Access auth page
    if (!_isRetry && isCfAccessAuthPage(response, text)) {
      await handleCfAccessAuth(serverUrl, cfHeaders !== undefined)
      return deploy(token, params, zipData, serverUrlOverride, true)
    }

    let body: any = text
    try {
      body = JSON.parse(text)
    } catch {
      // Keep as text
    }
    throw new ApiError(
      body?.error || `Deploy failed: ${response.status}`,
      response.status,
      body
    )
  }

  return response.json() as Promise<DeployCreateResponse>
}

// Create a share token for a project
export async function createShareToken(
  token: string,
  projectName: string,
  name: string,
  duration: ShareTokenDuration,
  namespace?: string | null,
  serverUrl?: string
): Promise<ShareTokenCreateResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ShareTokenCreateResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens${query}`,
    {
      method: 'POST',
      body: JSON.stringify({ name, duration }),
    },
    token,
    serverUrl
  )
}

// List share tokens for a project
export async function listShareTokens(
  token: string,
  projectName: string,
  namespace?: string | null,
  serverUrl?: string
): Promise<ShareTokenListResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ShareTokenListResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens${query}`,
    {},
    token,
    serverUrl
  )
}

// Revoke a share token
export async function revokeShareToken(
  token: string,
  projectName: string,
  tokenId: string,
  namespace?: string | null,
  serverUrl?: string
): Promise<ShareTokenResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ShareTokenResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens/${encodeURIComponent(tokenId)}${query}`,
    { method: 'DELETE' },
    token,
    serverUrl
  )
}
