# Plan: Conditional Auth Variables in Setup Flow

## Problem

The ops server setup flow asks for all auth-related variables regardless of AUTH_MODE:
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CLOUDFLARE_ACCESS_TEAM`

This is confusing because:
- In `local` mode: `CLOUDFLARE_ACCESS_TEAM` is not needed
- In `cloudflare-access` mode: `GOOGLE_CLIENT_ID/SECRET` are not needed

## Analysis

Variable requirements by auth mode:

| Variable | local (BetterAuth) | cloudflare-access |
|----------|-------------------|-------------------|
| `BETTER_AUTH_SECRET` | Required | Required (device flow tokens) |
| `GOOGLE_CLIENT_ID` | Required | Not needed |
| `GOOGLE_CLIENT_SECRET` | Required | Not needed |
| `CLOUDFLARE_ACCESS_TEAM` | Not needed | Required |

Note: `BETTER_AUTH_SECRET` is always required because both modes use the device authorization flow for CLI authentication, which generates bearer tokens via BetterAuth.

## Implementation

### 1. Update `.vars.example` with conditional documentation

Update the comments to clarify which variables are needed for which mode:

```
# Authentication mode: "local" or "cloudflare-access"
# - local: Uses BetterAuth with Google OAuth
# - cloudflare-access: Uses Cloudflare Zero Trust (no OAuth needed)
AUTH_MODE=

# Secret key for signing tokens (required for both modes)
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=

# Google OAuth (required when AUTH_MODE=local)
# Create at: https://console.cloud.google.com/apis/credentials
# Set redirect URI to: https://<APP_SUBDOMAIN>.<BASE_DOMAIN>/auth/callback/google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cloudflare Access team name (required when AUTH_MODE=cloudflare-access)
CLOUDFLARE_ACCESS_TEAM=
```

### 2. Modify setup flow in `ops/commands/server/setup.ts`

Change the interactive config (Step 4) to:

1. Ask for non-auth variables first (domain config, etc.)
2. Present AUTH_MODE choice using `@inquirer/prompts` select
3. Based on AUTH_MODE:
   - Always ask for `BETTER_AUTH_SECRET`
   - If `local`: Ask for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - If `cloudflare-access`: Ask for `CLOUDFLARE_ACCESS_TEAM`
4. Set unneeded variables to `_` (placeholder)

### 3. Update `ops/lib/config.ts`

Add constants to categorize auth variables:

```typescript
// Variables required only for local (BetterAuth) mode
export const LOCAL_AUTH_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
]

// Variables required only for cloudflare-access mode
export const CF_ACCESS_VARS = [
  'CLOUDFLARE_ACCESS_TEAM',
]

// Variables required for both auth modes
export const COMMON_AUTH_VARS = [
  'BETTER_AUTH_SECRET',
]
```

### 4. Update validation in `validateInstanceVars()`

Add auth-mode-aware validation:
- Check AUTH_MODE value
- Only flag missing vars if they're required for the configured mode

### 5. Update `server/src/env.ts`

Make conditionally-required variables optional in the TypeScript interface:

```typescript
export interface Env {
  // ...
  BETTER_AUTH_SECRET: string  // Always required
  AUTH_MODE: string
  GOOGLE_CLIENT_ID?: string   // Required for local mode
  GOOGLE_CLIENT_SECRET?: string
  CLOUDFLARE_ACCESS_TEAM?: string  // Required for cloudflare-access mode
}
```

### 6. Add runtime validation in server

Add startup validation to ensure required vars are set for the configured mode. This provides clear error messages if vars are missing.

Location: `server/src/index.ts` or a new `server/src/lib/validate-env.ts`

```typescript
function validateEnvForAuthMode(env: Env) {
  if (env.AUTH_MODE === 'cloudflare-access') {
    if (!env.CLOUDFLARE_ACCESS_TEAM || env.CLOUDFLARE_ACCESS_TEAM === '_') {
      throw new Error('CLOUDFLARE_ACCESS_TEAM is required when AUTH_MODE=cloudflare-access')
    }
  } else {
    // local mode (default)
    if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID === '_') {
      throw new Error('GOOGLE_CLIENT_ID is required when AUTH_MODE=local')
    }
    if (!env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET === '_') {
      throw new Error('GOOGLE_CLIENT_SECRET is required when AUTH_MODE=local')
    }
  }
}
```

## Files to Modify

1. `server/.vars.example` - Update comments
2. `ops/commands/server/setup.ts` - Conditional prompts
3. `ops/lib/config.ts` - Auth var categorization
4. `server/src/env.ts` - Optional types
5. `server/src/index.ts` - Runtime validation

## Testing

1. Run `bun ops server -i test setup` and select `local` mode
   - Should ask for GOOGLE_CLIENT_ID/SECRET
   - Should NOT ask for CLOUDFLARE_ACCESS_TEAM
   - CLOUDFLARE_ACCESS_TEAM should be set to `_`

2. Run `bun ops server -i test setup` and select `cloudflare-access` mode
   - Should ask for CLOUDFLARE_ACCESS_TEAM
   - Should NOT ask for GOOGLE_CLIENT_ID/SECRET
   - GOOGLE_CLIENT_ID/SECRET should be set to `_`

3. Verify server starts correctly with each configuration
