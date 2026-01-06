// Re-export API types from shared package
export type {
  DeviceFlowResponse,
  DeviceTokenResponse,
  User,
  UserResponse,
  Project,
  ProjectResponse,
  ProjectListResponse,
  Deploy,
  DeployListResponse,
  DeployCreateResponse,
} from '../../../../scratch-monorepo/shared/src/api'

// Keep Credentials type local (CLI-specific, not in shared)
export interface Credentials {
  token: string
  user: {
    id: string
    email: string
    name: string | null
  }
  server: string
}
