import { z } from 'zod'

// Device flow types (RFC 8628 format, used by BetterAuth device-authorization plugin)

// Device code request
export const deviceCodeRequestSchema = z.object({
  client_id: z.string(),
  scope: z.string().optional(),
})
export type DeviceCodeRequest = z.infer<typeof deviceCodeRequestSchema>

// Device code response (RFC 8628)
export const deviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  verification_uri_complete: z.string().optional(),
  interval: z.number().optional(),
})
export type DeviceCodeResponse = z.infer<typeof deviceCodeResponseSchema>

// Token request (RFC 8628)
export const deviceTokenRequestSchema = z.object({
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code'),
  device_code: z.string(),
  client_id: z.string(),
})
export type DeviceTokenRequest = z.infer<typeof deviceTokenRequestSchema>

// Token response - success
export const deviceTokenSuccessSchema = z.object({
  access_token: z.string(),
})
export type DeviceTokenSuccess = z.infer<typeof deviceTokenSuccessSchema>

// Token response - error
export const deviceTokenErrorSchema = z.object({
  error: z.enum([
    'authorization_pending',
    'slow_down',
    'expired_token',
    'access_denied',
    'invalid_grant',
  ]),
  error_description: z.string().optional(),
})
export type DeviceTokenError = z.infer<typeof deviceTokenErrorSchema>
