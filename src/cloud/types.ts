// API types for cloud commands
//
// Types are imported from @scratch/shared where they're defined using zod schemas.
// CLI-specific types (credentials) are defined locally.

// Re-export all shared API types (derived from zod schemas)
export type {
  ViewAccess,
  CreateProjectBody,
  UpdateProjectBody,
  ApiProject,
  ProjectResponse,
  ProjectsResponse,
  VersionResponse,
  UploadResponse,
  DeviceFlowResponse,
  DeviceTokenResponse,
  UserResponse,
  HealthResponse,
} from '@scratch/shared';

// Import for local use
import type { ApiProject } from '@scratch/shared';

// Alias for backwards compatibility
export type Project = ApiProject;

// CLI-specific types (credentials storage, not shared with server)
export interface Credentials {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    org: string;
  };
  server: string;
}

// API Token types
export interface ApiToken {
  id: string;
  name: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface TokensResponse {
  tokens: ApiToken[];
}

export interface CreateTokenBody {
  name?: string;
  expires_in_days?: number;
}

export interface CreateTokenResponse {
  id: string;
  token: string;
  name: string | null;
  expires_at: string | null;
  created_at: string;
}
