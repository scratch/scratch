# Plan: Add PROJECTS_EXPIRE_AFTER Config Variable

## Overview

Add a server config variable `PROJECTS_EXPIRE_AFTER` (in days) that causes projects to be deleted on read when they haven't been published in more than the specified number of days.

## Design Decisions

- **Lazy deletion on read**: Projects are deleted when a visitor attempts to access them, not via a background job
- **Expiration based on live deploy date**: The `created_at` of the deploy pointed to by `live_deploy_id`
- **Disabled by default**: Empty or `0` means no expiration
- **Never-published projects preserved**: Projects with no `live_deploy_id` are not expired
- **Async deletion**: Use `waitUntil()` so 404 returns immediately while cleanup happens in background

## Files to Modify

### 1. `server/.vars.example` - Add config variable

Add under the "Limits" section (after `MAX_DEPLOY_SIZE`):

```
# Auto-delete projects that haven't been published in this many days
# Set to empty or 0 to disable expiration
PROJECTS_EXPIRE_AFTER=
```

### 2. Regenerate `env.ts`

Run `bun ops server regenerate-env-ts` to add `PROJECTS_EXPIRE_AFTER: string` to the Env interface.

### 3. `server/src/lib/project-deletion.ts` - Create helper module (NEW FILE)

Extract deletion logic into a reusable module with:

- `deleteProject(c, options)` - Delete project, R2 files, and purge cache (reuse existing logic from `projects.ts` lines 250-288)
- `parseExpireAfterDays(value)` - Parse config value, return `null` if disabled
- `isProjectExpired(liveDeployCreatedAt, expireAfterDays)` - Check if project is expired

### 4. `server/src/routes/pages.ts` - Add expiration check

Modify lines 99-122:
1. Update query to join deploys table and get `live_deploy_created_at`
2. After project lookup, check if expired using helper functions
3. If expired, call `deleteProject()` via `waitUntil()` and return 404

### 5. `server/src/routes/www.ts` - Add expiration check

Same pattern as pages.ts (lines 52-76):
1. Update query to get `live_deploy_created_at`
2. Check expiration and delete if needed

### 6. `server/src/routes/app/api/projects.ts` - Refactor DELETE endpoint

Refactor the DELETE handler (lines 228-291) to use the new `deleteProject()` helper to avoid code duplication.

## Edge Cases

| Case | Behavior |
|------|----------|
| `PROJECTS_EXPIRE_AFTER` empty/not set | Feature disabled |
| `PROJECTS_EXPIRE_AFTER=0` | Feature disabled |
| `PROJECTS_EXPIRE_AFTER=abc` (invalid) | Feature disabled |
| Project has no `live_deploy_id` | Not expired (never published) |
| `WWW_PROJECT_ID` is expired | Will be deleted (admin should set appropriately) |

## Verification

Run the integration test:
```bash
bun ops server -i staging test
```

Manual verification:
1. Deploy with `PROJECTS_EXPIRE_AFTER=` (empty) - verify no deletion
2. Deploy with `PROJECTS_EXPIRE_AFTER=7` - verify projects serve normally
3. Use DB query to set a project's deploy `created_at` to >7 days ago
4. Access project - verify 404 and project deletion
