# Plan: Add `scratch cloud` CLI Commands

## Overview
Add a `scratch cloud` subcommand group to interact with the Scratch cloud server, enabling login, project management, and deployment.

## Commands
```
scratch cloud login          # Browser OAuth device flow
scratch cloud logout         # Clear credentials
scratch cloud whoami         # Show current user
scratch cloud projects list  # List projects
scratch cloud projects create <name> [--slug] [--access]
scratch cloud projects info <project>
scratch cloud projects update <project> [--name] [--access]
scratch cloud deploy [path] [--project]
```

## File Structure

### CLI (this repo)
```
src/
  index.ts                    # Register cloud commands
  cmd/cloud/
    index.ts                  # Command registration
    auth.ts                   # login, logout, whoami
    projects.ts               # projects subcommands
    deploy.ts                 # deploy command
  cloud/
    credentials.ts            # ~/.scratch/credentials.json management
    api.ts                    # Type-safe API client (native fetch)
    config.ts                 # Server URL, constants
    types.ts                  # API response types
```

### Server (scratch-server repo - requires modification)
```
worker/src/domains/app/device-flow.ts  # Return token in poll response
```

---

## Implementation Steps

### Phase 1: Server Modification
**File**: `~/git/scratch/scratch-server/worker/src/domains/app/device-flow.ts`

Modify `handleDeviceApproval` to store raw token temporarily:
```typescript
// After creating token, store raw token in device_auth_requests
await execute(
  db,
  `UPDATE device_auth_requests
   SET status = 'approved', user_id = $1, token_id = $2, raw_token = $3
   WHERE id = $4`,
  [user.id, tokenId, rawToken, deviceAuth.id]
);
```

Modify `pollDeviceToken` to return token when approved:
```typescript
case 'approved':
  // ... existing user query ...

  // Get the raw token before deleting
  const rawToken = deviceAuth.raw_token;

  // Delete the request (one-time use)
  await execute(db, `DELETE FROM device_auth_requests WHERE id = $1`, [deviceAuth.id]);

  return Response.json({
    status: 'approved',
    token: rawToken,  // Add this
    user: { id, email, name, org }
  });
```

Add `raw_token` column to `device_auth_requests` table (migration).

---

### Phase 2: CLI Infrastructure

#### `src/cloud/config.ts`
- `CLOUD_CONFIG.serverUrl` - default server URL (env override: `SCRATCH_CLOUD_URL`)
- `CLOUD_CONFIG.credentialsPath()` - returns `~/.scratch/credentials.json`
- Poll interval/timeout constants

#### `src/cloud/types.ts`
- Import types from `@scratch/shared`
- Define `Credentials`, `DeviceFlowResponse`, `UserResponse`, `ProjectResponse`, etc.

#### `src/cloud/credentials.ts`
- `getCredentials()` - read from ~/.scratch/credentials.json
- `saveCredentials(creds)` - write with mode 0o600
- `deleteCredentials()` - remove file
- `requireAuth()` - get credentials or throw

#### `src/cloud/api.ts`
- `createApiClient(credentials?)` - factory returning typed API methods
- Native fetch with Bearer token auth
- Methods: `initiateDeviceFlow`, `pollDeviceToken`, `me`, `listProjects`, `createProject`, `getProject`, `updateProject`, `uploadVersion`

---

### Phase 3: Auth Commands (`src/cmd/cloud/auth.ts`)

#### `loginCommand()`
1. Check if already logged in
2. Call `POST /auth/device` to get device_code, user_code, verification_url
3. Open browser to verification_url
4. Poll `POST /auth/device/token` until approved
5. Save credentials (token + user info)

#### `logoutCommand()`
- Delete credentials file

#### `whoamiCommand()`
- Load credentials, call `/api/me`, display user info

---

### Phase 4: Projects Commands (`src/cmd/cloud/projects.ts`)

#### `listProjectsCommand()`
- Call `GET /api/orgs/:org/projects`
- Display table of projects

#### `createProjectCommand(name, options)`
- Call `POST /api/orgs/:org/projects` with body
- Display created project URL

#### `projectInfoCommand(slug)`
- Call `GET /api/orgs/:org/projects/:project`
- Display project details

#### `updateProjectCommand(slug, options)`
- Call `PATCH /api/orgs/:org/projects/:project`
- Display updated settings

---

### Phase 5: Deploy Command (`src/cmd/cloud/deploy.ts`)

#### `deployCommand(path, options)`
1. Load credentials
2. Determine project slug (from `--project` or `package.json`)
3. Get/create project to obtain base path from URL
4. Build project with `--base` option
5. Zip `dist/` directory (use `jszip` library)
6. Upload via `POST /api/orgs/:org/projects/:project/upload`
7. Display live URL

---

### Phase 6: Command Registration

#### `src/cmd/cloud/index.ts`
- `registerCloudCommands(program)` - register all cloud subcommands with Commander

#### `src/index.ts`
- Import and call `registerCloudCommands(program)` before `program.parse()`

---

### Phase 7: Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "jszip": "^3.10.1"
  }
}
```

Link shared package (for types):
```bash
cd ~/git/scratch/scratch-worktrees/support-server
bun link @scratch/shared
# or add to package.json: "@scratch/shared": "file:../scratch-server/shared"
```

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `src/index.ts` | Import and register cloud commands |
| `package.json` | Add jszip, link @scratch/shared |

## New Files to Create

| File | Purpose |
|------|---------|
| `src/cloud/config.ts` | Server configuration |
| `src/cloud/types.ts` | API types |
| `src/cloud/credentials.ts` | Credential storage |
| `src/cloud/api.ts` | API client |
| `src/cmd/cloud/index.ts` | Command registration |
| `src/cmd/cloud/auth.ts` | Login/logout/whoami |
| `src/cmd/cloud/projects.ts` | Project CRUD |
| `src/cmd/cloud/deploy.ts` | Build and deploy |

## Server Files to Modify (separate repo)

| File | Changes |
|------|---------|
| `~/git/scratch/scratch-server/worker/src/domains/app/device-flow.ts` | Return token in poll response |
| Migration file | Add `raw_token` column to `device_auth_requests` |
