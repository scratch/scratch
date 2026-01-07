# Plan: Support Cloudflare Access Service Tokens

## Overview

When a Scratch Cloud server is protected by Cloudflare Access, the CLI needs to include CF Access service token headers to get past the edge protection. This plan implements support for configuring and using CF Access service tokens in the CLI.

## Current State

- `UserConfig` in `src/cloud/user-config.ts` has `server_url` and `namespace` fields
- `request()` in `src/cloud/api.ts` adds Bearer token for authentication but no CF Access headers
- No detection or helpful error messages for CF Access 403 responses

## Implementation

### 1. Add `cf_access_token` to UserConfig (`src/cloud/user-config.ts`)

Update the interface and TOML parser/generator:

```typescript
export interface UserConfig {
  server_url?: string
  namespace?: string
  cf_access_token?: string  // Format: "client-id:client-secret"
}
```

**Changes:**
- Add `cf_access_token` to `UserConfig` interface
- Add parsing for `cf_access_token` key in `parseTOML()`
- Add `cf_access_token` field to `generateTOML()` output (only if set, with explanatory comment)

### 2. Add CF Access Helpers (`src/cloud/cf-access.ts`)

New file with two functions:

```typescript
import { loadUserConfig } from './user-config'

export interface CfAccessHeaders {
  'CF-Access-Client-Id': string
  'CF-Access-Client-Secret': string
}

/**
 * Get CF Access headers if a service token is configured.
 * Returns undefined if no token is configured.
 */
export async function getCfAccessHeaders(): Promise<CfAccessHeaders | undefined> {
  const config = await loadUserConfig()

  if (!config.cf_access_token) {
    return undefined
  }

  // Split on first colon only (secret may contain colons)
  const colonIndex = config.cf_access_token.indexOf(':')
  if (colonIndex === -1) {
    return undefined
  }

  const clientId = config.cf_access_token.slice(0, colonIndex)
  const clientSecret = config.cf_access_token.slice(colonIndex + 1)

  if (!clientId || !clientSecret) {
    return undefined
  }

  return {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  }
}

/**
 * Check if a response is a CF Access denial.
 * Only returns true for 403 responses with clear CF Access indicators.
 */
export function isCfAccessDenied(response: Response): boolean {
  if (response.status !== 403) {
    return false
  }

  // CF Access sets this header when it blocks a request
  return response.headers.has('cf-mitigated')
}
```

**Note:** The detection is conservative - only triggers when the `cf-mitigated` header is present, which CF Access sets when it blocks a request. This avoids false positives from regular 403 responses.

### 3. Update `request()` Function (`src/cloud/api.ts`)

Modify the request function to include CF Access headers and detect CF Access denials:

```typescript
import { getCfAccessHeaders, isCfAccessDenied } from './cf-access'

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  const serverUrl = await getServerUrl()
  const url = `${serverUrl}${path}`

  // Include CF Access headers if configured
  const cfHeaders = await getCfAccessHeaders()
  const headers: Record<string, string> = {
    ...(cfHeaders || {}),
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // ... existing timeout/fetch logic ...

  if (!response.ok) {
    // Check for CF Access denial before reading body
    if (isCfAccessDenied(response)) {
      throw new ApiError(
        `Cloudflare Access denied. Run: scratch cloud cf-access <client-id:client-secret>`,
        403
      )
    }

    // ... existing error handling (read body, parse JSON, throw ApiError) ...
  }

  return response.json() as Promise<T>
}
```

### 4. Update Direct Fetch Calls (`src/cloud/api.ts`)

Update `deleteProject()` and `deploy()` to include CF Access headers:

```typescript
export async function deleteProject(...): Promise<void> {
  const cfHeaders = await getCfAccessHeaders()
  // ...
  response = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...(cfHeaders || {}),
      Authorization: `Bearer ${token}`,
    },
    signal: controller.signal,
  })

  if (!response.ok) {
    if (isCfAccessDenied(response)) {
      throw new ApiError(
        `Cloudflare Access denied. Run: scratch cloud cf-access <client-id:client-secret>`,
        403
      )
    }
    // ... existing error handling ...
  }
}
```

Same pattern for `deploy()`.

### 5. Add `cloud cf-access` Command (`src/cmd/cloud/index.ts`)

Add a dedicated command for configuring the CF Access token:

```typescript
cloud
  .command('cf-access <token>')
  .description('Set Cloudflare Access service token (format: client-id:client-secret)')
  .action(withErrorHandling('cloud cf-access', async (token: string) => {
    await cfAccessCommand(token)
  }))
```

### 6. Implement `cfAccessCommand()` (`src/cmd/cloud/auth.ts`)

```typescript
export async function cfAccessCommand(token: string): Promise<void> {
  if (!token.includes(':')) {
    throw new Error('Invalid token format. Expected: client-id:client-secret')
  }

  const globalConfig = await loadUserConfig()
  globalConfig.cf_access_token = token
  await saveUserConfig(globalConfig)

  log.info('CF Access token saved to global configuration')
}
```

This is a dedicated command that:
- Takes the token as a required argument
- Validates the format (must contain `:`)
- Saves to global config (not project config)
- Works from any directory

## Files to Modify

1. **`src/cloud/user-config.ts`**
   - Add `cf_access_token` to `UserConfig` interface
   - Update `parseTOML()` to parse `cf_access_token`
   - Update `generateTOML()` to include `cf_access_token` (only when set)

2. **`src/cloud/cf-access.ts`** (new file)
   - `getCfAccessHeaders()` - parse token and return headers
   - `isCfAccessDenied()` - detect CF Access 403 responses

3. **`src/cloud/api.ts`**
   - Update `request()` to include CF Access headers and detect denials
   - Update `deleteProject()` same way
   - Update `deploy()` same way

4. **`src/cmd/cloud/auth.ts`**
   - Add `cfAccessCommand()` function

5. **`src/cmd/cloud/index.ts`**
   - Register `cloud cf-access` command

## User Experience

### Setting Up CF Access Token

```
$ scratch cloud cf-access abc123:secret456
CF Access token saved to global configuration
```

### Error When Token Not Configured

```
$ scratch cloud login
cloud login failed: Cloudflare Access denied. Run: scratch cloud cf-access <client-id:client-secret>
```

### Successful Login With CF Access

```
$ scratch cloud login
Logging in to https://app.scratch.dev

Your verification code is:

    ABCD-1234

Opening browser to complete authentication...
Waiting for approval...

Logged in as user@example.com
```

## Testing Plan

### Unit Tests (`test/unit/cloud/cf-access.test.ts`)

**`getCfAccessHeaders()`:**
- Returns undefined when no token configured
- Returns headers when valid token configured
- Handles malformed tokens (no colon → undefined)
- Handles empty client ID or secret (→ undefined)
- Splits on first colon only (secret may contain colons)

**`isCfAccessDenied()`:**
- Returns true for 403 with `cf-mitigated` header present
- Returns false for 403 without the header
- Returns false for non-403 status codes

### Unit Tests (`test/unit/cloud/user-config.test.ts`)

**TOML parsing:**
- Parse config with `cf_access_token` field
- Parse config without `cf_access_token` field (undefined)

**TOML generation:**
- Generate config with `cf_access_token` includes the field
- Generate config without `cf_access_token` omits the field
- Token value with special characters escaped properly

## Security Considerations

1. **Token storage**: Stored in `~/.config/scratch/config.toml` (0o644). CF service tokens are organization-level, not user secrets. Users can rotate in CF dashboard if compromised.

2. **Token in requests**: Sent with every API request to CF-protected servers. Ensure tokens are not logged in debug output.

## Migration

Existing users unaffected - CF Access token is optional. When they hit a CF Access-protected server without a token, the error message tells them exactly what to do.
