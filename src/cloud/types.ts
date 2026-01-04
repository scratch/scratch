// Device flow response from POST /auth/device
export interface DeviceFlowResponse {
  device_code: string
  user_code: string
  verification_url: string
  expires_in: number
  interval: number
}

// Device token response from POST /auth/device/token
export interface DeviceTokenResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired'
  token?: string
  user?: {
    id: string
    email: string
    name: string | null
  }
}

// User response from GET /api/me
export interface UserResponse {
  user: {
    id: string
    email: string
    name: string | null
    image: string | null
  }
}

// Stored credentials
export interface Credentials {
  token: string
  user: {
    id: string
    email: string
    name: string | null
  }
  server: string
}
