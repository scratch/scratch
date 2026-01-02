// Type-safe API client for cloud server

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
} from './types';

/**
 * Create an API client for the cloud server
 */
export function createApiClient(credentials?: Credentials) {
  const baseUrl = credentials?.server || CLOUD_CONFIG.serverUrl;
  const token = credentials?.token;

  async function request<T>(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    log.debug(`[API] ${method} ${url}`);

    const headers: Record<string, string> = {
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.body instanceof ArrayBuffer) {
        headers['Content-Type'] = 'application/zip';
        body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }

    const response = await fetch(url, { method, headers, body });
    log.debug(`[API] Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      log.debug(`[API] Error response:`, error);
      throw new Error(error.error || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  return {
    // Auth endpoints (no token required)
    async initiateDeviceFlow(): Promise<DeviceFlowResponse> {
      return request('POST', '/auth/device');
    },

    async pollDeviceToken(deviceCode: string): Promise<DeviceTokenResponse> {
      return request('POST', '/auth/device/token', {
        body: { device_code: deviceCode },
      });
    },

    // API endpoints (token required)
    async health(): Promise<{ status: string }> {
      return request('GET', '/api/health');
    },

    async me(): Promise<UserResponse> {
      return request('GET', '/api/me');
    },

    async listProjects(org: string): Promise<ProjectsResponse> {
      return request('GET', `/api/orgs/${encodeURIComponent(org)}/projects`);
    },

    async createProject(
      org: string,
      body: CreateProjectBody
    ): Promise<ProjectResponse> {
      return request('POST', `/api/orgs/${encodeURIComponent(org)}/projects`, {
        body,
      });
    },

    async getProject(org: string, project: string): Promise<ProjectResponse> {
      return request(
        'GET',
        `/api/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(project)}`
      );
    },

    async updateProject(
      org: string,
      project: string,
      body: UpdateProjectBody
    ): Promise<ProjectResponse> {
      return request(
        'PATCH',
        `/api/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(project)}`,
        { body }
      );
    },

    async uploadVersion(
      org: string,
      project: string,
      zipBuffer: ArrayBuffer
    ): Promise<UploadResponse> {
      return request(
        'POST',
        `/api/orgs/${encodeURIComponent(org)}/projects/${encodeURIComponent(project)}/upload`,
        { body: zipBuffer }
      );
    },
  };
}
