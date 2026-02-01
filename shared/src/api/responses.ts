// API Response Types
// These match the actual JSON responses from the server

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

// Project URLs
export interface ProjectUrls {
  primary: string  // Short URL (local-part) when single domain, or email URL
  byId: string     // User ID URL (always works)
  www?: string     // WWW/root domain URL (only when www mode is requested and configured)
}

// Project (output of formatProject)
export interface Project {
  id: string
  name: string
  owner_id: string
  live_version: number | null
  deploy_count: number
  visibility: string
  urls: ProjectUrls
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
    created: boolean
  }
  urls: ProjectUrls
  // WWW mode info (only present when www=true in request)
  www?: {
    // Whether server's WWW_PROJECT_ID is configured for this project
    configured: boolean
    // The project ID to use when configuring WWW_PROJECT_ID
    project_id: string
  }
}
