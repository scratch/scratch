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
  // Deploy request
  DeployCreateQuery,
  DeployCreateParams,
  // Share tokens
  ShareToken,
  ShareTokenDuration,
  ShareTokenCreateRequest,
  ShareTokenCreateResponse,
  ShareTokenListResponse,
  ShareTokenResponse,
} from '../../../../scratch-monorepo/shared/src/api'

// Re-export share token constants
export { shareTokenDurations } from '../../../../scratch-monorepo/shared/src/api'

// Re-export deploy schema for validation
export { deployCreateQuerySchema } from '../../../../scratch-monorepo/shared/src/api'

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
