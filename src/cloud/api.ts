// Type-safe API client for cloud server using Hono RPC

import { hc } from 'hono/client';
import type { AppType } from '@scratch/shared';
import { CLOUD_CONFIG } from './config';
import log from '../logger';
import type {
  Credentials,
  DeviceFlowResponse,
  DeviceTokenResponse,
  UserResponse,
  ProjectResponse,
  ProjectsResponse,
  CreateProjectBody,
  UpdateProjectBody,
  UploadResponse,
  TokensResponse,
  CreateTokenBody,
  CreateTokenResponse,
} from './types';

/**
 * Create an API client for the cloud server
 *
 * Uses Hono RPC for type-safe /api/* routes.
 * Auth routes (/auth/*) use manual fetch as they're not part of AppType.
 */
export function createApiClient(credentials?: Credentials) {
  const baseUrl = credentials?.server || CLOUD_CONFIG.serverUrl;
  const token = credentials?.token;

  // Create Hono RPC client for /api/* routes
  const client = hc<AppType>(baseUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  // Helper for auth endpoints (not in Hono app)
  async function authRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    authenticated = false
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    log.debug(`[API] ${method} ${url}`);

    const headers: Record<string, string> = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    if (authenticated && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    log.debug(`[API] Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || `Request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // Helper to check response and throw on error
  async function checkResponse<T>(response: { ok: boolean; status: number; statusText: string; json: () => Promise<T> }): Promise<T> {
    log.debug(`[API] Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  return {
    // ========================================
    // Auth endpoints (manual fetch - not in AppType)
    // ========================================

    async initiateDeviceFlow(): Promise<DeviceFlowResponse> {
      return authRequest('POST', '/auth/device');
    },

    async pollDeviceToken(deviceCode: string): Promise<DeviceTokenResponse> {
      return authRequest('POST', '/auth/device/token', { device_code: deviceCode });
    },

    // ========================================
    // API endpoints (Hono RPC - fully type-safe)
    // ========================================

    async health(): Promise<{ status: string }> {
      const res = await client.api.health.$get();
      return checkResponse(res);
    },

    async me(): Promise<UserResponse> {
      const res = await client.api.me.$get();
      return checkResponse(res) as Promise<UserResponse>;
    },

    async listProjects(org: string): Promise<ProjectsResponse> {
      const res = await client.api.orgs[':org'].projects.$get({
        param: { org },
      });
      return checkResponse(res) as Promise<ProjectsResponse>;
    },

    async createProject(org: string, body: CreateProjectBody): Promise<ProjectResponse> {
      const res = await client.api.orgs[':org'].projects.$post({
        param: { org },
        json: body,
      });
      return checkResponse(res) as Promise<ProjectResponse>;
    },

    async getProject(org: string, project: string): Promise<ProjectResponse> {
      const res = await client.api.orgs[':org'].projects[':project'].$get({
        param: { org, project },
      });
      return checkResponse(res) as Promise<ProjectResponse>;
    },

    async updateProject(
      org: string,
      project: string,
      body: UpdateProjectBody
    ): Promise<ProjectResponse> {
      const res = await client.api.orgs[':org'].projects[':project'].$patch({
        param: { org, project },
        json: body,
      });
      return checkResponse(res) as Promise<ProjectResponse>;
    },

    // Binary upload - manual fetch (Hono RPC doesn't handle raw binary)
    async uploadVersion(
      org: string,
      project: string,
      zipBuffer: ArrayBuffer
    ): Promise<UploadResponse> {
      const url = `${baseUrl}/api/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(project)}/upload`;
      log.debug(`[API] POST ${url}`);

      const headers: Record<string, string> = {
        'Content-Type': 'application/zip',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: zipBuffer,
      });

      return checkResponse(response) as Promise<UploadResponse>;
    },

    // ========================================
    // Token management endpoints (manual fetch - not in AppType)
    // ========================================

    async listTokens(): Promise<TokensResponse> {
      return authRequest('GET', '/auth/tokens', undefined, true);
    },

    async createToken(body?: CreateTokenBody): Promise<CreateTokenResponse> {
      return authRequest('POST', '/auth/tokens', body || {}, true);
    },

    async deleteToken(id: string): Promise<void> {
      const url = `${baseUrl}/auth/tokens/${encodeURIComponent(id)}`;
      log.debug(`[API] DELETE ${url}`);

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'DELETE',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });

      log.debug(`[API] Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Token not found');
        }
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((error as { error?: string }).error || `Request failed: ${response.status}`);
      }
    },

    // ========================================
    // Project delete (manual fetch - DELETE returns 204)
    // ========================================

    async deleteProject(org: string, project: string): Promise<void> {
      const url = `${baseUrl}/api/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(project)}`;
      log.debug(`[API] DELETE ${url}`);

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'DELETE',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });

      log.debug(`[API] Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Project not found');
        }
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error((error as { error?: string }).error || `Request failed: ${response.status}`);
      }
    },
  };
}
