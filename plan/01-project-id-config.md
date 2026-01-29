# Project ID Persistence

When a project is published, its ID is saved to `.scratch/project.toml`. On subsequent publishes, this ID is sent to the server so it can identify the project even if the name changes.

## Changes Made

### 1. Shared Types (`shared/src/api/deploys.ts`)

- Added `project_id: z.string().optional()` to `deployCreateQuerySchema`
- Added `project_id?: string` to `DeployCreateParams` interface

### 2. CLI Config Types (`cli/src/config/types.ts`)

- Added `id?: string` field to `ProjectConfig` interface

### 3. CLI Config Loading/Saving (`cli/src/config/project-config.ts`)

- `loadProjectConfig`: Now parses `id` field from TOML
- `saveProjectConfig`: Writes `id` field first with comment "# Project ID (do not modify)"

### 4. CLI API Client (`cli/src/cloud/api.ts`)

- `deploy()`: Now includes `project_id` in query params when provided

### 5. CLI Publish Command (`cli/src/cmd/cloud/publish.ts`)

- Sends `config.id` as `project_id` in deploy params
- Saves returned `project.id` to config after successful deploy
- Handles `PROJECT_NOT_FOUND` error (400) with helpful message:
  ```
  Project not found on server.

  This can happen if:
    - The project was deleted from the server
    - You're logged in as a different user (currently logged in as user@example.com)
    - The .scratch/project.toml contains an ID from a different server

  To fix, remove the "id" line from .scratch/project.toml and publish again.
  ```
- Handles `PROJECT_NAME_TAKEN` error (400) when renaming to a name user already owns:
  ```
  You already have a project named "new-name".

  Run `scratch projects info new-name` to see details.
  ```
- Clears `id` from config when user picks a new name due to 403 conflict

### 6. Server Deploy Endpoint (`server/src/routes/app/api/deploys.ts`)

- Parses `project_id` from query params
- When `project_id` provided:
  - Looks up project by ID
  - If not found OR owner doesn't match: returns `PROJECT_NOT_FOUND` (400)
  - If name differs from URL param: updates project name (checks for conflicts first)
  - If user already has a project with the new name: returns `PROJECT_NAME_TAKEN` (400)
- When `project_id` not provided:
  - Keeps existing behavior (lookup by name + owner, auto-create)
- Added `PROJECT_NOT_FOUND` and `PROJECT_NAME_TAKEN` to `TxResult` error reasons

## Example project.toml

After publishing, the `.scratch/project.toml` will look like:

```toml
# Scratch Cloud Project Configuration
#
# This file configures how your project deploys to Scratch Cloud.
# Run `scratch cloud config` to update these settings interactively.

# Project ID (do not modify)
id = "abc123xyz"

# Project name
name = "my-project"

# Server URL (overrides global default)
server_url = "https://app.scratch.example.com"

# Visibility
visibility = "public"
```

## Verification

Run integration test against staging:
```bash
bun ops server -i staging test
```

Manual testing:
1. Fresh project: `scratch publish` → verify id saved to project.toml
2. Re-deploy: `scratch publish` → verify no "created project" message
3. Rename: Edit name in project.toml, publish → verify server name updated
4. Invalid ID: Set id to "invalid123", publish → verify helpful error
