import { getServerUrl } from './config'
import type {
  DeviceFlowResponse,
  DeviceTokenResponse,
  UserResponse,
  ProjectsResponse,
  ProjectResponse,
  DeploysResponse,
  DeployResponse,
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

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
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

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = await response.text()
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
export async function listProjects(token: string): Promise<ProjectsResponse> {
  return request<ProjectsResponse>('/api/projects', {}, token)
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

  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = await response.text()
    }
    throw new ApiError(`Delete failed: ${response.status}`, response.status, body)
  }
}

// List deploys for a project
export async function listDeploys(
  token: string,
  name: string,
  namespace?: string | null
): Promise<DeploysResponse> {
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  return request<DeploysResponse>(
    `/api/projects/${encodeURIComponent(name)}/deploys${query}`,
    {},
    token
  )
}

// Deploy a project (upload zip)
export async function deploy(
  token: string,
  name: string,
  zipData: ArrayBuffer,
  namespace?: string | null
): Promise<DeployResponse> {
  const serverUrl = await getServerUrl()
  const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  const url = `${serverUrl}/api/projects/${encodeURIComponent(name)}/deploy${query}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
    },
    body: zipData,
  })

  if (!response.ok) {
    let body: any
    try {
      body = await response.json()
    } catch {
      body = await response.text()
    }
    throw new ApiError(
      body?.error || `Deploy failed: ${response.status}`,
      response.status,
      body
    )
  }

  return response.json() as Promise<DeployResponse>
}
