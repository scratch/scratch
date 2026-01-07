// API Types for Scratch Cloud
// These match the actual JSON responses from the server

// Device flow types (for CLI authentication)
export interface DeviceFlowResponse {
  device_code: string
  user_code: string
  verification_url: string
  expires_in: number
  interval: number
}

export interface DeviceTokenResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired'
  token?: string
  user?: {
    id: string
    email: string
    name: string | null
  }
}

// User
export interface User {
  id: string
  email: string
  name: string | null
  image: string | null
}

export interface UserResponse {
  user: User
}

// Project (output of formatProject)
export interface Project {
  id: string
  name: string
  namespace: string
  owner_id: string
  live_version: number | null
  deploy_count: number
  visibility: string
  url: string
  created_at: string
  updated_at: string
  last_deploy_at: string | null
}

export interface ProjectResponse {
  project: Project
}

export interface ProjectListResponse {
  projects: Project[]
}

// Deploy
export interface Deploy {
  id: string
  version: number
  is_live: boolean
  file_count: number
  total_bytes: number
  created_at: string
}

export interface DeployListResponse {
  deploys: Deploy[]
}

// Deploy create response (POST /api/projects/:name/deploy)
export interface DeployCreateResponse {
  deploy: {
    id: string
    project_id: string
    version: number
    file_count: number
    total_bytes: number
    created_at: string
  }
  project: {
    id: string
    name: string
    namespace: string
    created: boolean
  }
  url: string
}

// Deploy request parameters (for CLI use)
export interface DeployCreateParams {
  // Project name (URL path parameter)
  name: string
  // Namespace (query parameter, defaults to 'global')
  namespace?: string
  // Visibility for auto-created projects (query parameter)
  // Accepts: 'public', 'private', '@domain.com', 'email@example.com', or comma-separated list
  visibility?: string
}

// Share tokens
export const shareTokenDurations = ['1d', '1w', '1m'] as const
export type ShareTokenDuration = (typeof shareTokenDurations)[number]

export interface ShareToken {
  id: string
  project_id: string
  name: string
  duration: ShareTokenDuration
  expires_at: string
  is_active: boolean
  is_expired: boolean
  is_revoked: boolean
  revoked_at: string | null
  created_at: string
}

// Response when creating a new share token (includes the token value - shown only once)
export interface ShareTokenCreateResponse {
  share_token: ShareToken
  token: string
  share_url: string
}

// Response for listing share tokens
export interface ShareTokenListResponse {
  share_tokens: ShareToken[]
}

// Response for single share token operations (revoke)
export interface ShareTokenResponse {
  share_token: ShareToken
}

// CLI-specific types
// Note: Credentials type is now in src/config/types.ts
