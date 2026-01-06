import { getServerUrl } from './config'
import type {
  DeviceFlowResponse,
  DeviceTokenResponse,
  UserResponse,
  ProjectListResponse,
  ProjectResponse,
  DeployListResponse,
  DeployCreateResponse,
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

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  const serverUrl = await getServerUrl()
  const url = `${serverUrl}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

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

  if (!response.ok) {
    // Read as text first, then try to parse as JSON
    const text = await response.text()
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

  return response.json() as Promise<T>
}

// Device flow: initiate
export async function initiateDeviceFlow(): Promise<DeviceFlowResponse> {
  return request<DeviceFlowResponse>('/auth/device', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// Device flow: poll for token
export async function pollDeviceToken(deviceCode: string): Promise<DeviceTokenResponse> {
  return request<DeviceTokenResponse>('/auth/device/token', {
    method: 'POST',
    body: JSON.stringify({ device_code: deviceCode }),
  })
}

// Get current user info
export async function getCurrentUser(token: string): Promise<UserResponse> {
  return request<UserResponse>('/api/me', {}, token)
}

// List projects
export async function listProjects(token: string): Promise<ProjectListResponse> {
  return request<ProjectListResponse>('/api/projects', {}, token)
}

// Get single project
export async function getProject(
  token: string,
  name: string,
  namespace?: string | null
): Promise<ProjectResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ProjectResponse>(`/api/projects/${encodeURIComponent(name)}${query}`, {}, token)
}

// Delete project
export async function deleteProject(
  token: string,
  name: string,
  namespace?: string | null
): Promise<void> {
  const serverUrl = await getServerUrl()
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  const url = `${serverUrl}/api/projects/${encodeURIComponent(name)}${query}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
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
    const text = await response.text()
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
  namespace?: string | null
): Promise<DeployListResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<DeployListResponse>(
    `/api/projects/${encodeURIComponent(name)}/deploys${query}`,
    {},
    token
  )
}

// Deploy a project (upload zip)
const DEPLOY_TIMEOUT = 120000 // 2 minutes for file uploads

export async function deploy(
  token: string,
  name: string,
  zipData: ArrayBuffer,
  namespace?: string | null
): Promise<DeployCreateResponse> {
  const serverUrl = await getServerUrl()
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  const url = `${serverUrl}/api/projects/${encodeURIComponent(name)}/deploy${query}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEPLOY_TIMEOUT)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
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
    const text = await response.text()
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
  namespace?: string | null
): Promise<ShareTokenCreateResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ShareTokenCreateResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens${query}`,
    {
      method: 'POST',
      body: JSON.stringify({ name, duration }),
    },
    token
  )
}

// List share tokens for a project
export async function listShareTokens(
  token: string,
  projectName: string,
  namespace?: string | null
): Promise<ShareTokenListResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ShareTokenListResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens${query}`,
    {},
    token
  )
}

// Revoke a share token
export async function revokeShareToken(
  token: string,
  projectName: string,
  tokenId: string,
  namespace?: string | null
): Promise<ShareTokenResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<ShareTokenResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens/${encodeURIComponent(tokenId)}${query}`,
    { method: 'DELETE' },
    token
  )
}
