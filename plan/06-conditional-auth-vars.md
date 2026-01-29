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

### 1. Modify setup flow in `ops/commands/server/setup.ts`

Change the interactive config (Step 4) to:

1. Ask for non-auth variables first (domain config, etc.)
2. Present AUTH_MODE choice using `@inquirer/prompts` select
3. Based on AUTH_MODE:
   - Always ask for `BETTER_AUTH_SECRET`
   - If `local`: Ask for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - If `cloudflare-access`: Ask for `CLOUDFLARE_ACCESS_TEAM`
4. Set unneeded variables to `_` (placeholder)

### 2. Update validation in `ops/lib/config.ts`

Update `validateInstanceVars()` to be auth-mode-aware:
- Check AUTH_MODE value
- Only flag missing vars if they're required for the configured mode
- Treat `_` as "not set" for conditional variables

### 3. Add runtime validation in server

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

Note: `env.ts` remains unchanged. All fields stay required at the TypeScript level (they'll have `_` as a value when not needed). Runtime validation checks for actual usability.

## Files to Modify

1. `ops/commands/server/setup.ts` - Conditional prompts based on AUTH_MODE
2. `ops/lib/config.ts` - Auth-mode-aware validation in `validateInstanceVars()`
3. `server/src/index.ts` - Runtime validation for auth mode requirements

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

## Implementation Complete

### Changes Made

#### 1. `ops/commands/server/setup.ts`
- Added `select` import from `@inquirer/prompts`
- Modified Step 4 to:
  - First prompt for all non-auth variables
  - Present AUTH_MODE as a select dropdown (local vs cloudflare-access)
  - Ask for BETTER_AUTH_SECRET (always required)
  - Based on AUTH_MODE:
    - `local`: Ask for GOOGLE_CLIENT_ID/SECRET, set CLOUDFLARE_ACCESS_TEAM to `_`
    - `cloudflare-access`: Ask for CLOUDFLARE_ACCESS_TEAM, set Google vars to `_`

#### 2. `ops/lib/config.ts`
- Added auth mode constants (`COMMON_AUTH_VARS`, `LOCAL_AUTH_VARS`, `CF_ACCESS_AUTH_VARS`)
- Added `isUnset()` helper to treat `_` and empty strings as unset
- Updated `validateInstanceVars()` to be auth-mode-aware:
  - Always validates BETTER_AUTH_SECRET
  - For `local` mode: validates Google OAuth vars
  - For `cloudflare-access` mode: validates CLOUDFLARE_ACCESS_TEAM

#### 3. `server/src/lib/validate-env.ts` (new file)
- Runtime validation for auth mode requirements
- Throws descriptive errors on startup if required vars are missing
- Skipped in test mode

#### 4. `server/src/index.ts`
- Added import for `validateEnvForAuthMode`
- Added middleware that validates environment on first request

### Tests Added
- `ops/test/config.test.ts` - 11 tests for ops config validation
- `server/test/validate-env.test.ts` - 13 tests for server-side validation

### Verification
- All 24 unit tests pass
- Full integration test (`bun ops server -i staging test`) passes
