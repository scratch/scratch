import { SERVER_URL } from './config'
import type { DeviceFlowResponse, DeviceTokenResponse, UserResponse } from './types'

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
  const url = `${SERVER_URL}${path}`
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
