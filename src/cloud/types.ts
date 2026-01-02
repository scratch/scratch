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
