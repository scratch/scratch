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

// Project from API
export interface Project {
  id: string
  name: string
  namespace: string | null
  owner_id: string
  live_version: number | null
  deploy_count: number
  visibility: string
  url: string
  created_at: string
  updated_at: string
  last_deploy_at: string | null
}

// Deploy from API
export interface Deploy {
  id: string
  version: number
  is_live: boolean
  file_count: number
  total_bytes: number
  created_at: string
}

// Deploy response from POST /api/projects/:name/deploy
export interface DeployResponse {
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
    namespace: string | null
    created: boolean
  }
  url: string
}

// Projects list response
export interface ProjectsResponse {
  projects: Project[]
}

// Single project response
export interface ProjectResponse {
  project: Project
}

// Deploys list response
export interface DeploysResponse {
  deploys: Deploy[]
}
