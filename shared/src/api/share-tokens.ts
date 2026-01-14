import { z } from 'zod'

// Duration options for share tokens
export const shareTokenDurations = ['1d', '1w', '1m'] as const
export type ShareTokenDuration = (typeof shareTokenDurations)[number]

// Duration in seconds
export const SHARE_TOKEN_DURATION_SECONDS: Record<ShareTokenDuration, number> = {
  '1d': 1 * 24 * 60 * 60,      // 1 day
  '1w': 7 * 24 * 60 * 60,      // 1 week
  '1m': 30 * 24 * 60 * 60,     // 1 month (30 days)
}

// Create request schema (for validation)
export const shareTokenCreateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  duration: z.enum(shareTokenDurations),
})
export type ShareTokenCreateRequest = z.infer<typeof shareTokenCreateRequestSchema>

// Share token response type (for listing - does NOT include the actual token value)
export interface ShareToken {
  id: string
  project_id: string
  name: string
  duration: ShareTokenDuration
  expires_at: string
  is_active: boolean
  is_expired: boolean
  is_revoked: boolean
  revoked_at: string | null
  created_at: string
}

// Response when creating a new share token (includes the token value - shown only once)
export interface ShareTokenCreateResponse {
  share_token: ShareToken
  token: string
  share_url: string
}

// Response for listing share tokens
export interface ShareTokenListResponse {
  share_tokens: ShareToken[]
}

// Response for single share token operations (revoke)
export interface ShareTokenResponse {
  share_token: ShareToken
}
