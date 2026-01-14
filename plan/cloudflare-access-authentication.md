# Cloudflare Access Authentication for Scratch

This document explains how to configure Cloudflare Access to protect the Scratch server, and how both browser and CLI authentication work when `AUTH_MODE=cloudflare-access`.

## Overview

When deploying Scratch behind Cloudflare Access, all requests must be authenticated by Cloudflare before reaching the origin. This provides enterprise-grade security using your existing identity provider (Okta, Azure AD, Google Workspace, etc.).

## Authentication Flows

### Browser Authentication (Web Users)

```
┌──────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ Browser  │────>│ Cloudflare Access│────>│ Identity Provider│────>│ Scratch Server │
│          │     │ (Login Page)     │     │ (Okta, Azure, etc)│    │ (App Ready)    │
└──────────┘     └──────────────────┘     └──────────────────┘     └────────────────┘
```

**Step-by-step:**

1. User visits `https://app.example.com`
2. Cloudflare Access intercepts the request (no valid `CF_Authorization` cookie)
3. CF Access redirects to the Access login page
4. User selects their identity provider and authenticates
5. IdP returns to CF Access with identity assertion
6. CF Access sets `CF_Authorization` cookie (JWT) and forwards request to origin
7. Scratch server validates the JWT via `Cf-Access-Jwt-Assertion` header
8. Server auto-creates user record if needed, serves the app
9. Subsequent requests include the cookie, bypassing the login page

**No changes needed** - this flow works automatically once CF Access is configured.

---

### CLI Authentication (Unified Flow)

The CLI uses the **same flow regardless of server auth mode**. It races two completion methods - whichever succeeds first wins.

```
┌───────────┐                    ┌─────────────┐                    ┌──────────────────┐
│    CLI    │                    │   Browser   │                    │  Scratch Server  │
└─────┬─────┘                    └──────┬──────┘                    └────────┬─────────┘
      │                                 │                                    │
      │ 1. POST /auth/device/code ──────────────────────────────────────────>│
      │<─────────────────────────── device_code, user_code ─────────────────│
      │                                 │                                    │
      │ 2. Start localhost:PORT server  │                                    │
      │                                 │                                    │
      │ 3. Open browser ───────────────>│                                    │
      │    /device?user_code=XXX        │                                    │
      │                                 │                                    │
      │                                 │ 4. (CF Access may intercept)       │
      │                                 │                                    │
      │ 5. CLI races two methods:       │                                    │
      │    ┌─────────────────────┐      │                                    │
      │    │ A) Poll /auth/      │      │ ───────────────────────────────────│
      │    │    device/token     │      │                                    │
      │    └─────────────────────┘      │                                    │
      │    ┌─────────────────────┐      │                                    │
      │    │ B) Listen on        │<─────│ (redirect if CF Access mode)       │
      │    │    localhost:PORT   │      │                                    │
      │    └─────────────────────┘      │                                    │
      │                                 │                                    │
      │ 6. First to complete wins       │                                    │
      │    - Polling returns token  OR  │                                    │
      │    - Localhost receives token   │                                    │
      │                                 │                                    │
      │ 7. Store credentials, done      │                                    │
```

**How it works:**

1. **CLI requests device code** (same as today): `POST /auth/device/code` → gets `device_code` + `user_code`
2. **CLI starts localhost server** on a fixed port (e.g., 8400)
3. **CLI opens browser** to: `/device?user_code=XXX`
4. **CLI races two completion methods:**
   - **Method A (polling)**: Poll `/auth/device/token` every 5 seconds
   - **Method B (localhost callback)**: Listen for redirect to `localhost:8400/callback`
5. **Whichever completes first wins** - CLI stores the token and cancels the other

**Server behavior depends on AUTH_MODE:**

| AUTH_MODE | Server behavior at `/device?user_code=XXX` |
|-----------|-------------------------------------------|
| `local` | Shows approval UI. User clicks "Approve". Device flow completes. **Polling wins.** |
| `cloudflare-access` | User already authenticated via CF Access. Server creates app token, extracts CF Access JWT, and redirects to `localhost:8400/callback?token=XXX&cf_token=YYY&state=user_code`. **Localhost wins.** |

**Key insight:** The `user_code` serves as the `state` parameter for CSRF protection in the redirect flow.

**Subsequent API requests:**

| AUTH_MODE | Headers sent by CLI |
|-----------|---------------------|
| `local` | `Authorization: Bearer <app_token>` |
| `cloudflare-access` | `cf-access-token: <cf_jwt>` + `Authorization: Bearer <app_token>` |

The `cf-access-token` header passes Cloudflare Access (equivalent to the `CF_Authorization` cookie). The `Authorization` header authenticates with the app.

---

## Implementation Details

### Modified `/device` Endpoint

The existing `/device` endpoint adds redirect behavior for CF Access mode:

**Location:** `server/src/routes/app/ui.ts`

```typescript
const LOCALHOST_CALLBACK_PORT = 8400

// GET /device - Device/CLI login
// AUTH_MODE=local: Shows device approval UI (existing behavior)
// AUTH_MODE=cloudflare-access: Creates token and redirects to localhost
uiRoutes.get('/device', async (c) => {
  const userCode = c.req.query('user_code')
  if (!userCode) {
    return html(renderDeviceErrorPage('Missing verification code'), 400)
  }

  // CF Access mode: user is already authenticated, redirect with token
  if (c.env.AUTH_MODE === 'cloudflare-access') {
    // Get user from CF Access JWT (already authenticated by CF Access)
    const cfUser = await getOrCreateCloudflareAccessUser(c.req.raw, c.env)
    if (!cfUser) {
      return html(renderDeviceErrorPage('Not authenticated'), 401)
    }

    // Check user is allowed
    if (!isUserAllowed(cfUser.email, c.env)) {
      return html(renderDeviceErrorPage('Access denied'), 403)
    }

    // Create Bearer token using BetterAuth
    const auth = createAuth(c.env)
    const session = await auth.api.createSession({
      userId: cfUser.id,
    })

    // Extract CF Access JWT to pass to CLI (for subsequent API requests)
    const cfAccessJwt = c.req.header('Cf-Access-Jwt-Assertion')

    // Redirect to localhost callback, using user_code as state
    const callbackUrl = new URL(`http://localhost:${LOCALHOST_CALLBACK_PORT}/callback`)
    callbackUrl.searchParams.set('token', session.token)
    callbackUrl.searchParams.set('state', userCode)  // user_code doubles as state
    if (cfAccessJwt) {
      callbackUrl.searchParams.set('cf_token', cfAccessJwt)  // CF Access JWT for API calls
    }

    return c.redirect(callbackUrl.toString())
  }

  // Local mode: existing device approval UI flow
  const user = await getAuthenticatedUser(c.req.raw, c.env)
  // ... rest of existing implementation (show approval UI)
})
```

### CLI Changes: Race Polling and Localhost Callback

**Location:** `cli/src/cmd/cloud/auth.ts`

The CLI runs both completion methods in parallel - first one to succeed wins.

```typescript
const LOCALHOST_CALLBACK_PORT = 8400

interface AuthResult {
  token: string
  cfToken?: string  // CF Access JWT (only present when server uses cloudflare-access mode)
}

export async function loginCommand(ctx: CloudContext): Promise<void> {
  const serverUrl = await ctx.getServerUrl()

  // 1. Request device code (same as today)
  const client = createBetterAuthClient(serverUrl)
  const codeResponse = await client.device.code({ client_id: 'scratch-cli' })
  const { device_code, user_code, interval = 5 } = codeResponse.data

  // 2. Start localhost server for potential callback
  const localhostPromise = waitForLocalhostCallback(LOCALHOST_CALLBACK_PORT, user_code)

  // 3. Start polling for device flow completion
  const pollingPromise = pollForDeviceToken(client, device_code, interval)

  // 4. Open browser
  const verifyUrl = `${serverUrl}/device?user_code=${user_code}`
  log.info(`Your verification code is: ${user_code}`)
  log.info('Opening browser to authenticate...')
  await openBrowser(verifyUrl)

  // 5. Race the two methods
  log.info('Waiting for authentication...')
  const result = await Promise.race([localhostPromise, pollingPromise])

  // 6. Cancel the loser (cleanup)
  // (implementation detail - abort controllers, close server, etc.)

  // 7. Get user info and save credentials
  // Note: If we have cfToken, we need to include it in the request headers
  const headers = result.cfToken ? { 'cf-access-token': result.cfToken } : undefined
  const { user } = await getCurrentUser(result.token, serverUrl, headers)

  await saveCredentials({
    token: result.token,
    cfToken: result.cfToken,  // Store CF Access JWT if present
    user,
  }, serverUrl)

  log.info(`Logged in as ${user.email}`)
}

async function waitForLocalhostCallback(port: number, expectedState: string): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`)

      if (url.pathname === '/callback') {
        const state = url.searchParams.get('state')
        const token = url.searchParams.get('token')
        const cfToken = url.searchParams.get('cf_token')  // CF Access JWT

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<h1>Invalid state</h1>')
          return  // Don't resolve/reject, keep waiting
        }

        if (token) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<h1>Authentication successful!</h1><p>You can close this window.</p>')
          server.close()
          resolve({ token, cfToken: cfToken || undefined })
        }
      }
    })

    server.listen(port)
  })
}

async function pollForDeviceToken(client: BetterAuthClient, deviceCode: string, interval: number): Promise<AuthResult> {
  // Existing polling logic - same as current implementation
  while (true) {
    await sleep(interval * 1000)
    const response = await client.device.token({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: 'scratch-cli',
    })

    if (response.data?.access_token) {
      return { token: response.data.access_token }  // No cfToken from polling
    }

    if (response.error?.error === 'authorization_pending') {
      continue
    }

    throw new Error(response.error?.error_description || 'Polling failed')
  }
}
```

### CLI API Requests: Include CF Access Token When Present

**Location:** `cli/src/cloud/api.ts`

```typescript
async function request<T>(path: string, options: RequestInit, token: string, serverUrl: string): Promise<T> {
  const credentials = await loadCredentials(serverUrl)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }

  // Include CF Access token if stored (for servers behind Cloudflare Access)
  if (credentials?.cfToken) {
    headers['cf-access-token'] = credentials.cfToken
  }

  const response = await fetch(`${serverUrl}${path}`, { ...options, headers })
  // ... rest of implementation
}
```

**Key points:**
- CLI doesn't need to know server's auth mode
- Same user experience regardless of server configuration
- `user_code` serves double duty as both verification code and CSRF state
- Fixed port (8400) keeps things simple - if it's busy, localhost callback fails but polling still works
- CF Access token is automatically included in API requests when present

---

## Part 1: Cloudflare Account Configuration

### 1.1 Prerequisites

- A Cloudflare account with Zero Trust enabled
- A domain added to Cloudflare (e.g., `example.com`)
- An identity provider configured in CF Zero Trust (Okta, Azure AD, Google Workspace, etc.)

### 1.2 Create the Access Application

1. Go to [Cloudflare One Dashboard](https://one.dash.cloudflare.com) → **Access** → **Applications**
2. Click **Add an application** → **Self-hosted**
3. Configure:

   | Setting | Value |
   |---------|-------|
   | **Application name** | `scratch-server` |
   | **Session Duration** | `24 hours` |
   | **Application domain** | `app.example.com` |

### 1.3 Configure Access Policy

Create a single **Allow** policy for authorized users:

| Setting | Value |
|---------|-------|
| **Policy name** | `Allow users` |
| **Action** | `Allow` |
| **Include** | Emails ending in: `@yourcompany.com` |

Or for specific users:
| **Include** | Emails: `alice@example.com`, `bob@example.com` |

### 1.4 Configure Identity Provider

1. Go to **Settings** → **Authentication**
2. Add your identity provider (Okta, Azure AD, Google Workspace, One-time PIN, etc.)
3. In the Access Application, select which IdPs users can authenticate with

### 1.5 (Optional) Bypass for API Endpoints

If you want the CLI to work without browser auth (using only Bearer tokens), you can add a Bypass policy for API paths. However, this reduces security.

**Not recommended** - the browser flow is more secure.

---

## Part 2: Server Configuration

### 2.1 Environment Variables

```bash
# Authentication mode
AUTH_MODE=cloudflare-access

# Your Cloudflare Access team name
# Found at: Zero Trust Dashboard → Settings → Custom Pages → Team domain
# If your team domain is "mycompany.cloudflareaccess.com", use "mycompany"
CLOUDFLARE_ACCESS_TEAM=mycompany

# Still needed for creating Bearer tokens
BETTER_AUTH_SECRET=your-32-char-secret-here

# Application-level access control (defense in depth)
ALLOWED_USERS=@yourcompany.com
```

### 2.2 Required Code Changes

1. **Modify `/device` endpoint** to redirect to localhost callback in CF Access mode (see Implementation Details above)
2. **Ensure Bearer token validation** works for tokens created via `auth.api.createSession()`

### 2.3 Deploy and Test

```bash
# Push secrets
bun ops server -i staging config push

# Deploy
bun ops server -i staging deploy

# Test browser access
open https://app.staging.example.com
# Should redirect to CF Access → IdP → back to app
```

---

## Part 3: CLI Usage

### 3.1 Login

```bash
scratch cloud login
# Opens browser → CF Access login → IdP auth → localhost callback
# "Logged in as alice@yourcompany.com"
```

### 3.2 What Gets Stored

After login, `~/.scratch/credentials.json` contains:

```json
{
  "https://app.example.com": {
    "token": "bearer-token-here",
    "cfToken": "cf-access-jwt-here",  // Only present for CF Access servers
    "user": {
      "id": "user-id",
      "email": "alice@yourcompany.com",
      "name": "Alice"
    }
  }
}
```

### 3.3 Subsequent Commands

All CLI commands work the same way:

```bash
scratch cloud whoami
scratch cloud deploy
scratch cloud projects list
```

The CLI automatically includes the appropriate headers based on stored credentials:
- **Always:** `Authorization: Bearer <token>` (app authentication)
- **If cfToken present:** `cf-access-token: <cfToken>` (passes CF Access)

---

## Part 4: Security Considerations

### 4.1 Why Browser Handoff?

| Approach | Pros | Cons |
|----------|------|------|
| **Browser handoff** | Uses existing IdP session, no shared secrets, per-user tokens | Requires browser |
| Service tokens | Works headless | Shared secret, less secure |
| WARP tunnel | Full identity | Complex setup, requires client |

Browser handoff is the best balance of security and usability for interactive CLI use.

### 4.2 Token Expiration

The CF Access JWT has a separate expiration from the app Bearer token (typically 24 hours, configurable in CF Access Application settings).

When the CF Access JWT expires:
1. API requests will fail with 403 from CF Access
2. CLI detects this and prompts user to re-login
3. User runs `scratch cloud login` again

The app Bearer token may have a longer expiration (e.g., 30 days), but if the CF Access JWT expires first, re-login is required.

### 4.3 Token Security

- **State parameter**: Prevents CSRF attacks on the callback
- **Localhost only**: Callback only goes to `localhost`, never external
- **Short-lived tokens**: Server can set token expiration
- **Per-user tokens**: Each user has their own Bearer token

### 4.4 Defense in Depth

Two layers of access control:
1. **Cloudflare Access**: Controls who can reach the server at all
2. **ALLOWED_USERS**: Controls who can use the application

A user must pass both checks.

---

## Part 5: Setup Checklist

### Cloudflare Dashboard
- [ ] Create Access Application for `app.example.com`
- [ ] Add Allow policy for authorized users
- [ ] Configure identity provider(s)
- [ ] Test browser access works

### Server
- [ ] Set `AUTH_MODE=cloudflare-access`
- [ ] Set `CLOUDFLARE_ACCESS_TEAM`
- [ ] Modify `/device` endpoint to redirect to localhost in CF Access mode
- [ ] Deploy and test

### CLI
- [ ] Add localhost callback server (port 8400) to login flow
- [ ] Race polling and localhost callback with `Promise.race()`
- [ ] Store `cfToken` in credentials when present
- [ ] Include `cf-access-token` header in API requests when `cfToken` is stored
- [ ] Test full login → deploy flow (works for both auth modes)

---

## References

- [Cloudflare Access Applications](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/)
- [Validating Access JWTs](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- [GitHub CLI Auth](https://cli.github.com/manual/gh_auth_login) - similar browser handoff pattern
