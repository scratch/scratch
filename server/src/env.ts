// Auto-generated from .vars.example - do not edit manually
// Regenerate with: bun run ops regenerate-env-ts

export interface Env {
  // Wrangler bindings (not in .vars.example)
  FILES: R2Bucket
  DB: D1Database

  // Environment variables
  D1_DATABASE_ID: string
  BASE_DOMAIN: string
  APP_SUBDOMAIN: string
  CONTENT_SUBDOMAIN: string
  WWW_PROJECT_ID: string
  BETTER_AUTH_SECRET: string
  AUTH_MODE: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  CLOUDFLARE_ACCESS_TEAM: string
  ALLOWED_USERS: string
  MAX_VISIBILITY: string
  ALLOW_SHARE_TOKENS: string
  MAX_DEPLOY_SIZE: string

  // Testing (optional, set via --var flag)
  TEST_MODE?: string
}
