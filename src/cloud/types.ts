// API types for cloud commands

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

export interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    org: string;
  };
}

export interface UserResponse {
  user: {
    id: string;
    email: string;
    name: string;
    org: string;
  };
}

export interface Project {
  name: string;
  slug: string;
  current_version: number;
  view_access: 'public' | 'authenticated';
  created_at: string;
  url: string;
}

export interface ProjectResponse {
  project: Project;
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface CreateProjectBody {
  name: string;
  slug?: string;
  view_access?: 'public' | 'authenticated';
}

export interface UpdateProjectBody {
  name?: string;
  view_access?: 'public' | 'authenticated';
}

export interface VersionResponse {
  version_number: number;
  file_count: number;
  total_size_bytes: number;
}

export interface UploadResponse {
  version: VersionResponse;
  url: string;
  message: string;
}
