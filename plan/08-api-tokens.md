# API Token Support for CLI and Server

Add support for long-lived API tokens that enable programmatic access to Scratch without interactive login. Uses Better Auth's `apiKey()` plugin.

## Problem

The current device authorization flow requires interactive browser login:

1. CLI generates user code
2. User opens browser, logs in, approves device
3. CLI receives session token

This doesn't work for:
- **CI/CD pipelines** - No browser available
- **Scripts and automation** - Non-interactive environments
- **Service accounts** - Machine-to-machine communication

## Solution

Use Better Auth's built-in `apiKey()` plugin which provides:

- API key creation, listing, and revocation
- Server-side hashing (keys stored securely)
- Optional expiration, rate limiting, and metadata
- Seamless integration with existing auth system

**Note:** Verify Better Auth's actual API endpoints before implementation. The plugin should expose:
- `POST /auth/api-key/create` - Create new key
- `GET /auth/api-key/list` - List user's keys
- `POST /auth/api-key/delete` - Revoke a key

Consult https://www.better-auth.com/docs/plugins/api-key for current API.

### Authentication Flow Comparison

| Method | Use Case | Lifetime | Creation |
|--------|----------|----------|----------|
| Device Auth (current) | Interactive CLI login | 30 days | Browser OAuth |
| API Token (new) | CI/CD, automation | User-defined | Web UI or CLI |

## Implementation

### 1. Server: Add apiKey Plugin

**File:** `server/src/auth.ts`

```typescript
import { betterAuth } from 'better-auth'
import { bearer, deviceAuthorization, apiKey } from 'better-auth/plugins'

export function createAuth(env: Env) {
  return betterAuth({
    // ... existing config ...

    plugins: [
      bearer(),
      deviceAuthorization({ /* existing config */ }),

      // NEW: API key support
      apiKey({
        defaultPrefix: 'scratch_',
        defaultKeyLength: 32,
        enableMetadata: true,
        enableSessionForAPIKeys: true,  // Allow API keys in getSession() checks
        apiKeyHeaders: ['x-api-key'],   // Only accept X-Api-Key header (not Authorization)

        // Snake_case field mapping
        schema: {
          apiKey: {
            modelName: 'api_key',
            fields: {
              userId: 'user_id',
              expiresAt: 'expires_at',
              createdAt: 'created_at',
              updatedAt: 'updated_at',
              rateLimitEnabled: 'rate_limit_enabled',
              rateLimitTimeWindow: 'rate_limit_time_window',
              rateLimitMax: 'rate_limit_max',
              requestCount: 'request_count',
              lastRequest: 'last_request',
              lastRefillAt: 'last_refill_at',
              refillAmount: 'refill_amount',
              refillInterval: 'refill_interval',
            },
          },
        },

        // Key expiration defaults
        keyExpiration: {
          defaultExpiresIn: null,           // No default expiration
          maxExpiresIn: 31536000000,        // 365 days maximum
        },
      }),
    ],
  })
}
```

### 2. Database: Add api_key Table

**File:** `server/src/db/schema.sql`

```sql
-- API Keys (BetterAuth apiKey plugin)
CREATE TABLE IF NOT EXISTS api_key (
    id TEXT PRIMARY KEY,
    name TEXT,
    start TEXT,                              -- First 6 chars (for display)
    prefix TEXT,                             -- Key prefix (plaintext)
    key TEXT NOT NULL,                       -- Hashed key
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    enabled INTEGER DEFAULT 1,
    remaining INTEGER,
    refill_amount INTEGER,
    refill_interval INTEGER,
    last_refill_at TEXT,
    expires_at TEXT,
    rate_limit_enabled INTEGER DEFAULT 1,
    rate_limit_time_window INTEGER,
    rate_limit_max INTEGER,
    request_count INTEGER DEFAULT 0,
    last_request TEXT,
    permissions TEXT,                        -- JSON permissions
    metadata TEXT,                           -- JSON metadata
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_key_user ON api_key(user_id);
CREATE INDEX IF NOT EXISTS idx_api_key_key ON api_key(key);
```

**Migration file:** `server/src/db/migrations/NNNN_add_api_key_table.sql`

### 3. Server: API Key Validation in API Routes

With `enableSessionForAPIKeys: true` configured in section 1, Better Auth's apiKey plugin automatically validates keys and makes them work with `auth.api.getSession()`. No additional route changes needed for the app subdomain.

**CRITICAL: Content domain must ignore API keys**

The pages subdomain serves user-uploaded JavaScript. API keys must NEVER grant access there.

**File:** `server/src/routes/pages.ts`

```typescript
// SECURITY: Never check X-Api-Key header on content domain
// API tokens are ONLY valid on the app subdomain
// User-uploaded JS could steal API keys if we accepted them here
//
// Authentication for private content uses project-scoped content tokens only
// (see content-token.ts)
```

This is enforced by:
1. Not configuring API key middleware on the pages routes
2. Content tokens use a completely separate JWT-based system
3. Integration tests verify API keys are rejected on content domain

### 4. CLI: Token Management Commands

**File:** `cli/src/cmd/cloud/tokens.ts`

```typescript
// scratch tokens list
export async function listTokensCommand(ctx: CloudContext): Promise<void> {
  const { data, error } = await ctx.api.get('/auth/api-key/list')
  if (error) {
    throw new Error(`Failed to list tokens: ${error.message}`)
  }

  if (data.length === 0) {
    console.log('No API tokens found.')
    console.log('\nCreate one with: scratch tokens create <name>')
    return
  }

  console.log('API Tokens:\n')
  for (const token of data) {
    const expires = token.expiresAt
      ? `expires ${new Date(token.expiresAt).toLocaleDateString()}`
      : 'no expiration'
    const status = token.enabled ? '' : ' (disabled)'
    console.log(`  ${token.name}${status}`)
    console.log(`    ID: ${token.id}`)
    console.log(`    Preview: ${token.start}...`)
    console.log(`    Created: ${new Date(token.createdAt).toLocaleDateString()}, ${expires}`)
    console.log()
  }
}

// scratch tokens create <name> [--expires <days>]
export async function createTokenCommand(
  ctx: CloudContext,
  name: string,
  options: { expires?: number }
): Promise<void> {
  // Validate token name
  if (name.length < 3 || name.length > 40) {
    throw new Error('Token name must be 3-40 characters')
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Token name can only contain letters, numbers, hyphens, and underscores')
  }

  const body: Record<string, unknown> = { name }

  if (options.expires) {
    body.expiresIn = options.expires * 24 * 60 * 60 * 1000 // days to ms
  }

  const { data, error } = await ctx.api.post('/auth/api-key/create', body)
  if (error) {
    throw new Error(`Failed to create token: ${error.message}`)
  }

  console.log(`\nCreated API token: ${name}\n`)
  console.log(`  ${data.key}`)
  console.log()
  console.log(chalk.yellow('⚠ Copy this token now. It will not be shown again.'))
  if (!options.expires) {
    console.log(chalk.dim('Tip: Use --expires <days> for CI tokens to limit exposure if leaked'))
  }
  console.log()
  console.log('Usage:')
  console.log('  # Option 1: Environment variable (CI/CD)')
  console.log('  export SCRATCH_TOKEN=<token>')
  console.log()
  console.log('  # Option 2: Project .env file')
  console.log('  echo "SCRATCH_TOKEN=<token>" >> .env')
  console.log()
  console.log('  # Option 3: Store in credentials file')
  console.log('  scratch tokens use <token>')
}

// scratch tokens revoke <id|name>
export async function revokeTokenCommand(ctx: CloudContext, idOrName: string): Promise<void> {
  // First, list tokens to find by name if needed
  const { data: tokens } = await ctx.api.get('/auth/api-key/list')
  const token = tokens.find(t => t.id === idOrName || t.name === idOrName)

  if (!token) {
    throw new Error(`Token not found: ${idOrName}`)
  }

  const { error } = await ctx.api.post('/auth/api-key/delete', { keyId: token.id })
  if (error) {
    throw new Error(`Failed to revoke token: ${error.message}`)
  }

  console.log(`Revoked token: ${token.name}`)
}

// scratch tokens use <token> [--server <url>] [--force]
export async function useTokenCommand(
  token: string,
  options: { server?: string; force?: boolean }
): Promise<void> {
  // Validate token format
  if (!token.startsWith('scratch_')) {
    throw new Error('Invalid token format. API tokens start with "scratch_"')
  }

  // Determine server URL using existing promptServerUrlSelection() from config/prompts.ts
  // This is a setup command, so always prompt when --server isn't provided
  // (same behavior as `publish` command)
  const serverUrl = options.server
    ? normalizeServerUrlInput(options.server).url
    : await promptServerUrlSelection()

  // Check for existing credential
  const credentials = loadCredentials()
  const existing = credentials[normalizeServerUrl(serverUrl)]
  if (existing && !options.force) {
    const existingType = existing.type === 'api_key' ? 'API token' : 'session'
    console.log(`You already have a ${existingType} stored for ${serverUrl}`)
    console.log(`  Authenticated as: ${existing.email ?? 'unknown'}`)
    console.log()
    console.log('To replace it, run:')
    console.log(`  scratch tokens use ${token} --force`)
    return
  }

  // Validate the token by making a test request
  const testHeaders = { 'X-Api-Key': token }
  const response = await fetch(`${serverUrl}/api/users/me`, { headers: testHeaders })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid or expired token')
    }
    throw new Error(`Failed to validate token: ${response.status}`)
  }

  const user = await response.json()

  // Save to credentials file (overwrites existing)
  saveCredentials(serverUrl, {
    token,
    type: 'api_key',
    email: user.email,
  })

  if (existing) {
    const existingType = existing.type === 'api_key' ? 'API token' : 'session'
    console.log(`Replaced ${existingType} with new API token for ${serverUrl}`)
  } else {
    console.log(`Saved API token for ${serverUrl}`)
  }
  console.log(`Authenticated as: ${user.email}`)
}
```

**File:** `cli/src/index.ts` - Add commands

```typescript
program
  .command('tokens')
  .description('Manage API tokens')
  .addCommand(
    new Command('list')
      .description('List your API tokens')
      .action(async () => {
        const ctx = await getCloudContext()
        await listTokensCommand(ctx)
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new API token')
      .argument('<name>', 'Token name')
      .option('--expires <days>', 'Days until expiration', parseInt)
      .action(async (name, options) => {
        const ctx = await getCloudContext()
        await createTokenCommand(ctx, name, options)
      })
  )
  .addCommand(
    new Command('revoke')
      .description('Revoke an API token')
      .argument('<id-or-name>', 'Token ID or name')
      .action(async (idOrName) => {
        const ctx = await getCloudContext()
        await revokeTokenCommand(ctx, idOrName)
      })
  )
  .addCommand(
    new Command('use')
      .description('Store an API token for CLI authentication')
      .argument('<token>', 'API token (starts with scratch_)')
      .option('--server <url>', 'Server URL (defaults to production)')
      .option('--force', 'Replace existing credential without prompting')
      .action(async (token, options) => {
        await useTokenCommand(token, options)
      })
  )
```

### 5. CLI: Token Storage and Resolution

**File:** `cli/src/config/credentials.ts`

```typescript
// Priority order for authentication:
// 1. SCRATCH_TOKEN from environment (always uses X-Api-Key)
//    - Bun auto-loads .env from cwd, so env var and .env are equivalent
// 2. Stored credentials from ~/.scratch/credentials.json (uses explicit token type)

interface StoredCredential {
  token: string
  type: 'session' | 'api_key'  // Explicit token type
  email?: string
}

// Credentials file structure: { [serverUrl]: StoredCredential }
// Example:
// {
//   "https://app.scratch.dev": { "token": "scratch_abc...", "type": "api_key", "email": "user@example.com" },
//   "https://app.staging.scratch.dev": { "token": "session_xyz...", "type": "session", "email": "user@example.com" }
// }

function getEnvToken(): string | null {
  // Bun auto-loads .env from cwd into process.env at startup
  // This covers both explicit env vars and .env file values
  return process.env.SCRATCH_TOKEN ?? null
}

export function getAuthHeaders(serverUrl: string): Record<string, string> {
  // Check environment variable / .env file first (always treated as API key)
  const envToken = getEnvToken()
  if (envToken) {
    return { 'X-Api-Key': envToken }
  }

  // Fall back to stored credentials
  const credentials = loadCredentials()
  const entry = credentials[normalizeServerUrl(serverUrl)] as StoredCredential | undefined
  if (!entry?.token) {
    return {}
  }

  // Use explicit token type from stored credentials
  // Default to 'session' for backwards compatibility with existing credentials
  const tokenType = entry.type ?? 'session'
  if (tokenType === 'api_key') {
    return { 'X-Api-Key': entry.token }
  }
  return { 'Authorization': `Bearer ${entry.token}` }
}
```

**File:** `cli/src/cloud/api.ts` - Update to use new auth headers

```typescript
export async function request<T>(
  path: string,
  options: RequestOptions
): Promise<ApiResponse<T>> {
  const headers = {
    ...getAuthHeaders(options.serverUrl),
    'Content-Type': 'application/json',
  }
  // ... rest of request
}
```

**File:** `cli/src/cmd/cloud/login.ts` - Update to store token type

When saving credentials after device authorization, include the token type:

```typescript
// After successful device auth
saveCredentials(serverUrl, {
  token: accessToken,
  type: 'session',  // NEW: explicit token type
  email: userEmail,
})
```

### 6. CLI: Update Login Help Text

When running `scratch login`, include info about API tokens:

```
Logged in as user@example.com

For CI/CD or automation, create an API token:
  scratch tokens create my-ci-token

Then use one of:
  export SCRATCH_TOKEN=scratch_...   # CI environment variable
  echo "SCRATCH_TOKEN=..." >> .env   # Project .env file
  scratch tokens use scratch_...     # Store in credentials file
```

## Security Considerations

### API Token vs Session Token

| Aspect | Session Token | API Token |
|--------|---------------|-----------|
| Creation | Device auth (browser) | CLI or API |
| Storage (server) | Plain text | Hashed |
| Lifetime | 30 days (rolling) | User-defined |
| Revocation | Logout | Explicit revoke |
| Rate limiting | None | Optional per-token |

### Security Invariants

1. **API tokens are user-scoped**: Each token belongs to a user and has the same permissions as that user
2. **Tokens are hashed in DB**: The actual token is only shown once at creation
3. **No content domain access**: API tokens work on the app subdomain only (same as session tokens)
4. **Audit trail**: Each token has `lastRequest` timestamp and `requestCount`
5. **Header isolation**: API tokens are only valid via `X-Api-Key` header, not `Authorization: Bearer`. Session tokens from device auth use `Authorization: Bearer`. This prevents confusion and makes token type explicit.
6. **Explicit token type storage**: The CLI stores token type (`session` or `api_key`) explicitly in credentials.json rather than relying on prefix detection. This avoids any dependency on Better Auth's internal token format.
7. **Environment variable convention**: `SCRATCH_TOKEN` (from env var or .env file) is always treated as an API key (uses `X-Api-Key` header). Users should only put API tokens in this variable, not session tokens.
8. **Token resolution priority**: Environment (including .env) > credentials.json. Bun auto-loads `.env` from cwd, so env vars and .env files have equivalent priority. This allows CI to override stored credentials.

### Recommendations

1. **Encourage expiration**: Prompt users to set expiration for CI tokens
2. **Name tokens descriptively**: Enforce meaningful names (e.g., "github-actions-deploy")
3. **Monitor usage**: Log token usage for security auditing
4. **Rotation reminders**: Consider notifying users of old tokens

## Testing

### Unit Tests

**File:** `cli/test/tokens.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { getAuthToken, getAuthHeaders } from '../src/config/credentials'

describe('getAuthToken', () => {
  const originalEnv = process.env.SCRATCH_TOKEN

  afterEach(() => {
    if (originalEnv) {
      process.env.SCRATCH_TOKEN = originalEnv
    } else {
      delete process.env.SCRATCH_TOKEN
    }
  })

  it('returns env var token when SCRATCH_TOKEN is set', () => {
    process.env.SCRATCH_TOKEN = 'scratch_test123'
    const token = getAuthToken('https://app.scratch.dev')
    expect(token).toBe('scratch_test123')
  })

  it('env var takes priority over stored credentials', () => {
    process.env.SCRATCH_TOKEN = 'scratch_from_env'
    // Even if credentials.json has a different token, env should win
    const token = getAuthToken('https://app.scratch.dev')
    expect(token).toBe('scratch_from_env')
  })

  it('falls back to stored credentials when env var not set', () => {
    delete process.env.SCRATCH_TOKEN
    // This would need mocking of loadCredentials()
    // ...
  })
})

describe('getAuthHeaders', () => {
  const originalEnv = process.env.SCRATCH_TOKEN
  const testDir = path.join(os.tmpdir(), 'scratch-test-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (originalEnv) {
      process.env.SCRATCH_TOKEN = originalEnv
    } else {
      delete process.env.SCRATCH_TOKEN
    }
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('uses X-Api-Key header for SCRATCH_TOKEN env var', () => {
    process.env.SCRATCH_TOKEN = 'scratch_abc123xyz'
    const headers = getAuthHeaders('https://app.scratch.dev')
    expect(headers).toEqual({ 'X-Api-Key': 'scratch_abc123xyz' })
  })

  it('SCRATCH_TOKEN env var always uses X-Api-Key (even without prefix)', () => {
    process.env.SCRATCH_TOKEN = 'any_token_value'
    const headers = getAuthHeaders('https://app.scratch.dev')
    expect(headers).toEqual({ 'X-Api-Key': 'any_token_value' })
  })

  // Note: Bun auto-loads .env from cwd into process.env at startup
  // Testing .env loading requires spawning a subprocess, which is covered in integration tests

  it('env var takes priority over stored credentials', () => {
    process.env.SCRATCH_TOKEN = 'scratch_from_env'
    // Mock stored credential - should be ignored
    const headers = getAuthHeaders('https://app.scratch.dev')
    expect(headers).toEqual({ 'X-Api-Key': 'scratch_from_env' })
  })

  it('uses Authorization header for stored session tokens', () => {
    delete process.env.SCRATCH_TOKEN
    // Mock stored credential with type: 'session'
    // mockCredentials({ 'https://app.scratch.dev': { token: 'sess_xyz', type: 'session' } })
    // const headers = getAuthHeaders('https://app.scratch.dev')
    // expect(headers).toEqual({ 'Authorization': 'Bearer sess_xyz' })
  })

  it('uses X-Api-Key header for stored API key tokens', () => {
    delete process.env.SCRATCH_TOKEN
    // Mock stored credential with type: 'api_key'
    // mockCredentials({ 'https://app.scratch.dev': { token: 'scratch_stored', type: 'api_key' } })
    // const headers = getAuthHeaders('https://app.scratch.dev')
    // expect(headers).toEqual({ 'X-Api-Key': 'scratch_stored' })
  })

  it('returns correct headers for different server URLs', () => {
    delete process.env.SCRATCH_TOKEN
    // Mock different credentials for different servers
    // mockCredentials({
    //   'https://app.scratch.dev': { token: 'scratch_prod', type: 'api_key' },
    //   'https://app.staging.scratch.dev': { token: 'sess_staging', type: 'session' }
    // })
    // expect(getAuthHeaders('https://app.scratch.dev')).toEqual({ 'X-Api-Key': 'scratch_prod' })
    // expect(getAuthHeaders('https://app.staging.scratch.dev')).toEqual({ 'Authorization': 'Bearer sess_staging' })
  })

  it('returns empty object when no token available', () => {
    delete process.env.SCRATCH_TOKEN
    // With no stored credentials either
    const headers = getAuthHeaders('https://app.scratch.dev')
    expect(headers).toEqual({})
  })
})

describe('useTokenCommand', () => {
  it('rejects tokens without scratch_ prefix', async () => {
    await expect(useTokenCommand('invalid_token', {}))
      .rejects.toThrow('Invalid token format')
  })

  it('validates token against server before storing', async () => {
    // Mock fetch to return 401
    // await expect(useTokenCommand('scratch_invalid', {}))
    //   .rejects.toThrow('Invalid or expired token')
  })

  it('stores valid token with correct type', async () => {
    // Mock fetch to return valid user
    // Mock saveCredentials
    // await useTokenCommand('scratch_valid123', {})
    // expect(saveCredentials).toHaveBeenCalledWith(
    //   'https://app.scratch.dev',
    //   { token: 'scratch_valid123', type: 'api_key', email: 'user@example.com' }
    // )
  })

  it('uses --server flag when provided (no prompt)', async () => {
    // Mock fetch and saveCredentials
    // await useTokenCommand('scratch_valid123', { server: 'https://app.staging.scratch.dev' })
    // expect(promptServerUrlSelection).not.toHaveBeenCalled()
    // expect(saveCredentials).toHaveBeenCalledWith(
    //   'https://app.staging.scratch.dev',
    //   expect.objectContaining({ token: 'scratch_valid123' })
    // )
  })

  it('prompts for server when --server not provided', async () => {
    // Mock promptServerUrlSelection to return a URL
    // await useTokenCommand('scratch_valid123', {})
    // expect(promptServerUrlSelection).toHaveBeenCalled()
  })

  it('warns and exits when credential already exists', async () => {
    // Mock existing credential
    // mockCredentials({ 'https://app.scratch.dev': { token: 'old', type: 'session', email: 'user@example.com' } })
    // const consoleSpy = jest.spyOn(console, 'log')
    // await useTokenCommand('scratch_new', {})
    // expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already have a session'))
    // expect(saveCredentials).not.toHaveBeenCalled()
  })

  it('replaces existing credential with --force', async () => {
    // Mock existing credential and valid fetch
    // mockCredentials({ 'https://app.scratch.dev': { token: 'old', type: 'session', email: 'old@example.com' } })
    // await useTokenCommand('scratch_new', { force: true })
    // expect(saveCredentials).toHaveBeenCalledWith(
    //   'https://app.scratch.dev',
    //   { token: 'scratch_new', type: 'api_key', email: 'new@example.com' }
    // )
  })

  it('shows correct message when replacing session vs API token', async () => {
    // Test replacing session shows "Replaced session with new API token"
    // Test replacing API token shows "Replaced API token with new API token"
  })
})
```

**File:** `server/test/api-key.test.ts`

```typescript
import { describe, it, expect } from 'bun:test'
// Test Better Auth apiKey plugin configuration

describe('API Key Schema Mapping', () => {
  it('maps all required fields to snake_case', () => {
    // Verify our schema config matches database columns
    const expectedMappings = {
      userId: 'user_id',
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      rateLimitEnabled: 'rate_limit_enabled',
      rateLimitTimeWindow: 'rate_limit_time_window',
      rateLimitMax: 'rate_limit_max',
      requestCount: 'request_count',
      lastRequest: 'last_request',
      lastRefillAt: 'last_refill_at',
      refillAmount: 'refill_amount',
      refillInterval: 'refill_interval',
    }
    // Import and verify auth config schema mappings match
  })
})
```

### Integration Tests

**File:** `ops/commands/server/test.ts`

Add API token tests to the existing integration test suite:

**Server API tests:**
1. **Create token** - Authenticated user can create token, returns `scratch_` prefixed key
2. **List tokens** - Returns token metadata (name, id, preview) but NOT full key
3. **Authenticate with token** - `X-Api-Key` header grants API access
4. **Invalid token rejected** - Non-existent token returns 401
5. **Expired token rejected** - Expired token returns 401
6. **Revoke token** - Token can be revoked by owner
7. **Revoked token rejected** - Revoked token returns 401
8. **Unauthenticated create rejected** - Cannot create token without session
9. **Token with expiration** - `expiresIn` sets correct `expiresAt`

**CLI integration tests:**
10. **Deploy with env var** - `SCRATCH_TOKEN` env var works for `scratch publish`
11. **Deploy with .env file** - Token in `./.env` works for `scratch publish` (requires subprocess)
12. **Deploy with stored credential** - `scratch tokens use` then `scratch publish` works
13. **tokens use validates token** - Invalid token rejected before storing
14. **tokens use stores correctly** - Credential saved with correct server URL and type
15. **Priority: env > credentials** - Verify SCRATCH_TOKEN overrides stored credentials

### CLI Command Tests

**File:** `cli/test/cmd/tokens.test.ts`

**tokens list:**
- Shows empty state with create instructions when no tokens exist
- Lists tokens with name, preview, dates - but not full key

**tokens create:**
- Creates token, displays full key once with copy warning
- `--expires <days>` sets expiration
- Fails without name argument
- Fails when not logged in
- Rejects names < 3 or > 40 characters
- Rejects names with special characters (only `a-zA-Z0-9_-` allowed)
- Shows expiration tip when `--expires` not used

**tokens revoke:**
- Revokes by name or ID
- Fails for non-existent token

**tokens use:**
- Validates token format (must start with `scratch_`)
- Validates token by calling `/api/users/me`
- Saves to credentials.json with `type: 'api_key'`
- Associates with correct server URL
- `--server <url>` overrides default server
- Fails for invalid/expired token
- Displays authenticated user email on success
- Warns and exits if credential already exists (without `--force`)
- `--force` replaces existing credential
- Shows what type of credential was replaced (session vs API token)

### Security Tests

Add to existing integration test suite:

1. **Token not exposed in list** - List endpoint returns preview only, not full key
2. **Token hashed in DB** - Verify Better Auth hashing is enabled (default)
3. **API token isolated from content domain** - X-Api-Key on pages subdomain does not grant access
4. **Rate limiting enforced** - Token with rate limit returns 429 after limit exceeded
5. **Token ownership enforced** - User cannot list/revoke another user's tokens

### Manual Testing Checklist

Run through these scenarios manually before release:

#### Token Creation

- [ ] `scratch tokens create my-token` - Creates token, shows once
- [ ] `scratch tokens create ci-token --expires 90` - Creates with 90-day expiry
- [ ] Token starts with `scratch_` prefix
- [ ] Token is 32+ characters after prefix
- [ ] Warning shown: "Copy this token now. It will not be shown again."

#### Token Listing

- [ ] `scratch tokens list` - Shows all tokens
- [ ] List shows: name, ID, preview (first 6 chars), created date, expiry
- [ ] List does NOT show full token value
- [ ] Empty state shows helpful create instructions

#### Token Usage

- [ ] Set `SCRATCH_TOKEN=scratch_xxx` and run `scratch publish`
- [ ] Deploy succeeds without interactive login
- [ ] `scratch projects` works with env var token
- [ ] Remove credentials.json, env var still works

#### Token Storage (tokens use)

- [ ] `scratch tokens use scratch_xxx` - Validates and stores token
- [ ] Stored in `~/.scratch/credentials.json` with `type: 'api_key'`
- [ ] Associated with correct server URL
- [ ] `scratch tokens use scratch_xxx --server https://app.staging.scratch.dev` - Custom server
- [ ] Rejects tokens that don't start with `scratch_`
- [ ] Rejects invalid/expired tokens with clear error
- [ ] Displays authenticated user email on success

#### Server URL Selection (tokens use)

- [ ] With `--server` flag: uses that server directly (no prompt)
- [ ] Without `--server`: always prompts for server selection
- [ ] Prompt shows logged-in servers as options
- [ ] Prompt shows default server if not logged in anywhere
- [ ] "other..." option in prompt allows entering custom URL

#### Existing Credential Handling

- [ ] With existing session: warns and shows `--force` instructions
- [ ] With existing API token: warns and shows `--force` instructions
- [ ] `--force` replaces existing session credential
- [ ] `--force` replaces existing API token credential
- [ ] Shows "Replaced session with new API token" when replacing session
- [ ] Shows "Replaced API token with new API token" when replacing API token

#### Token Priority

- [ ] SCRATCH_TOKEN from environment takes priority over credentials.json
- [ ] Bun auto-loads .env from cwd (env var and .env have same priority)
- [ ] Unsetting SCRATCH_TOKEN falls back to credentials.json

#### Token Revocation

- [ ] `scratch tokens revoke my-token` - Revokes by name
- [ ] `scratch tokens revoke <id>` - Revokes by ID
- [ ] After revocation, token no longer authenticates
- [ ] Revocation is immediate (no cache delay)

#### Error Handling

- [ ] Invalid token returns clear 401 error
- [ ] Expired token returns clear error with expiry info
- [ ] Revoked token returns "token revoked" message
- [ ] Rate limited token returns 429 with retry-after

#### Edge Cases

- [ ] Token name too short (< 3 chars) - rejected with clear error
- [ ] Token name too long (> 40 chars) - rejected with clear error
- [ ] Special characters in token name - rejected (only alphanumeric, hyphens, underscores allowed)
- [ ] Creating token when at max limit (if implemented)
- [ ] Concurrent token creation
- [ ] Token with 0 remaining uses

### E2E CI/CD Simulation

Test the actual CI/CD use case with each token storage method:

**Scenario 1: Environment variable (CI/CD)**
1. Create a token: `scratch tokens create ci-deploy --expires 30`
2. Simulate CI (no credentials): `export HOME=$(mktemp -d)`
3. Set token: `export SCRATCH_TOKEN=scratch_...`
4. Deploy: `scratch publish --name ci-test-env`
5. Verify: `scratch projects | grep ci-test-env`

**Scenario 2: .env file (project-specific)**
1. Create a token: `scratch tokens create project-token --expires 30`
2. Simulate clean environment: `export HOME=$(mktemp -d) && unset SCRATCH_TOKEN`
3. Create .env: `echo "SCRATCH_TOKEN=scratch_..." > .env`
4. Deploy in subprocess (Bun loads .env at startup): `bun scratch publish --name ci-test-dotenv`
5. Verify: `scratch projects | grep ci-test-dotenv`
6. Cleanup: `rm .env`

**Scenario 3: Stored credential (user-specific)**
1. Create a token: `scratch tokens create stored-token --expires 30`
2. Store it: `scratch tokens use scratch_...`
3. Simulate no env: `unset SCRATCH_TOKEN && rm -f .env`
4. Deploy: `scratch publish --name ci-test-stored`
5. Verify: `scratch projects | grep ci-test-stored`

**Scenario 4: Priority override**
1. Store a token: `scratch tokens use scratch_stored...`
2. Set env var: `export SCRATCH_TOKEN=scratch_env...`
3. Deploy and verify env var token is used (check audit log or use different user tokens)
4. Unset env var: `unset SCRATCH_TOKEN`
5. Deploy and verify stored token is used

### Test Coverage Requirements

Before merging, ensure:

- [ ] All unit tests pass: `bun test cli/test/tokens.test.ts`
- [ ] All integration tests pass: `bun ops server -i staging test`
- [ ] Security tests pass: `bun ops server -i staging test-security`
- [ ] Manual checklist completed
- [ ] E2E CI/CD simulation succeeds

## Files Changed

### Server

1. `server/src/auth.ts` - Add `apiKey()` plugin with config
2. `server/src/db/schema.sql` - Add `api_key` table
3. `server/src/db/migrations/NNNN_add_api_key_table.sql` - Migration

### CLI

4. `cli/src/cmd/cloud/tokens.ts` - New token management commands
5. `cli/src/index.ts` - Register `tokens` command group
6. `cli/src/config/credentials.ts` - Add `SCRATCH_TOKEN` env var support, add token type to stored credentials
7. `cli/src/cloud/api.ts` - Update request headers for API tokens
8. `cli/src/cmd/cloud/login.ts` - Store `type: 'session'` when saving device auth credentials

### Tests

9. `ops/commands/server/test.ts` - API token integration tests

## Documentation Updates

**File:** `CLAUDE.md` - Add to Authentication Architecture section:

```markdown
### API Tokens (Programmatic Access)

For CI/CD and automation, users can create API tokens:

```bash
# Create a token
scratch tokens create my-ci-token --expires 90

# Option 1: Use via environment variable (CI/CD)
export SCRATCH_TOKEN=scratch_...
scratch publish

# Option 2: Store in .env file (project-specific)
echo "SCRATCH_TOKEN=scratch_..." >> .env
scratch publish

# Option 3: Store in credentials file (user-specific)
scratch tokens use scratch_...
scratch publish
```

Token resolution priority: SCRATCH_TOKEN (env var or .env) > ~/.scratch/credentials.json

API tokens are:
- Hashed in the database (only shown once at creation)
- Optionally time-limited (recommended for CI)
- Revocable via `scratch tokens revoke <name>`
- Scoped to the user who created them
```

## Future Enhancements

1. **Web UI for token management** - Create/revoke tokens from dashboard
2. **Project-scoped tokens** - Tokens that can only deploy to specific projects
3. **Webhook notifications** - Notify on token usage from new IPs
4. **Token rotation** - Automatic rotation with grace period
