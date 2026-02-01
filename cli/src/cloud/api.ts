/**
 * Scratch Cloud API client.
 * Each function maps to a specific API endpoint.
 */

import { request, ApiError, CfAccessError } from './request'

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
} from '@scratch/shared/api'

// Re-export errors for consumers
export { ApiError, CfAccessError }

// =============================================================================
// User
// =============================================================================

export interface GetCurrentUserOptions {
  serverUrl?: string
  /** Skip CF Access prompt on auth failure - throw CfAccessError instead */
  skipCfAccessPrompt?: boolean
}

export async function getCurrentUser(token: string, options: GetCurrentUserOptions = {}): Promise<UserResponse> {
  return request<UserResponse>('/api/me', {
    token,
    serverUrl: options.serverUrl,
    skipCfAccessPrompt: options.skipCfAccessPrompt,
  })
}

// =============================================================================
// Projects
// =============================================================================

export async function listProjects(token: string, serverUrl?: string): Promise<ProjectListResponse> {
  return request<ProjectListResponse>('/api/projects', { token, serverUrl })
}

export async function getProject(token: string, name: string, serverUrl?: string): Promise<ProjectResponse> {
  return request<ProjectResponse>(`/api/projects/${encodeURIComponent(name)}`, { token, serverUrl })
}

export async function deleteProject(token: string, name: string, serverUrl?: string): Promise<void> {
  return request<void>(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    token,
    serverUrl,
  })
}

// =============================================================================
// Deploys
// =============================================================================

export async function listDeploys(token: string, name: string, serverUrl?: string): Promise<DeployListResponse> {
  return request<DeployListResponse>(`/api/projects/${encodeURIComponent(name)}/deploys`, { token, serverUrl })
}

const DEPLOY_TIMEOUT = 120000 // 2 minutes for file uploads

export async function deploy(
  token: string,
  params: DeployCreateParams,
  zipData: ArrayBuffer,
  serverUrl?: string
): Promise<DeployCreateResponse> {
  // Build query string
  const queryParams = new URLSearchParams()
  if (params.visibility) {
    queryParams.set('visibility', params.visibility)
  }
  if (params.project_id) {
    queryParams.set('project_id', params.project_id)
  }
  if (params.www) {
    queryParams.set('www', 'true')
  }
  const query = queryParams.toString() ? `?${queryParams.toString()}` : ''

  return request<DeployCreateResponse>(
    `/api/projects/${encodeURIComponent(params.name)}/deploy${query}`,
    {
      method: 'POST',
      body: zipData,
      contentType: 'application/zip',
      token,
      serverUrl,
      timeout: DEPLOY_TIMEOUT,
    }
  )
}

// =============================================================================
// Share Tokens
// =============================================================================

export async function createShareToken(
  token: string,
  projectName: string,
  name: string,
  duration: ShareTokenDuration,
  serverUrl?: string
): Promise<ShareTokenCreateResponse> {
  return request<ShareTokenCreateResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens`,
    {
      method: 'POST',
      body: JSON.stringify({ name, duration }),
      token,
      serverUrl,
    }
  )
}

export async function listShareTokens(
  token: string,
  projectName: string,
  serverUrl?: string
): Promise<ShareTokenListResponse> {
  return request<ShareTokenListResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens`,
    { token, serverUrl }
  )
}

export async function revokeShareToken(
  token: string,
  projectName: string,
  tokenId: string,
  serverUrl?: string
): Promise<ShareTokenResponse> {
  return request<ShareTokenResponse>(
    `/api/projects/${encodeURIComponent(projectName)}/share-tokens/${encodeURIComponent(tokenId)}`,
    { method: 'DELETE', token, serverUrl }
  )
}
