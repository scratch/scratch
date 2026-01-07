# Plan: Update `cloud config` Command

## Overview

Transform `cloud config` from a simple server URL prompt into a comprehensive configuration command that handles both project-level and global settings, with proper validation using shared types from the server.

## Current State

- `configCommand()` in `src/cmd/cloud/auth.ts:182-233` only configures `server_url` globally
- Global config: `~/.config/scratch/config.toml` (via `src/cloud/user-config.ts`)
- Project config: `.scratch/project.toml` (via `src/cmd/cloud/deploy.ts`)
- `ProjectConfig` interface only has `name` and `namespace`
- CLI's `deploy()` doesn't pass `visibility` to server (but server supports it)

## Shared Types from Server

**From `@scratch/shared` (scratch-monorepo/shared/src/):**

Group (visibility):
- `Group` type: `"public" | "private" | "@domain.com" | "email@x.com" | string[]`
- `validateGroupInput(value: string): string | null` - returns error message or null
- `parseGroup(value: string): Group` - parses string to Group
- `groupSchema` - zod schema for validation

Project:
- `validateProjectName(name: string): ValidationResult`
- `validateNamespace(namespace: string): ValidationResult`
- `validateNamespaceForUser(namespace: string, userEmail: string): ValidationResult`
- `normalizeNamespace(namespace: string): string`
- `getEmailDomain(email: string): string | null`
- `GLOBAL_NAMESPACE` constant (`'global'`)

## User Interface

### Global Config Flow (no pages/ directory)

```
$ scratch cloud config /tmp/some-dir

No pages/ directory found. Configuring global Scratch Cloud settings.

? Server URL: (https://app.scratch.dev) █
? Default namespace:
  ❯ global (shared namespace)
    acme.com (your domain)

Global configuration saved to ~/.config/scratch/config.toml
```

### Project Config Flow (has pages/ directory)

```
$ scratch cloud config .

Configuring project: /Users/me/my-project

? Project name: (my-project) █
? Namespace:
  ❯ acme.com (your domain)
    global (shared namespace)
? Server URL: (https://app.scratch.dev) █
? Visibility:
  ❯ private (only you)
    public (anyone with the URL)
    @acme.com (anyone at acme.com)
    Share with specific people...

Project configuration saved to .scratch/project.toml

Your project URL will be:
  https://pages.scratch.dev/acme.com/my-project/
```

### Share With Specific People Flow

When user selects "Share with specific people...":

```
? Visibility:
    private (only you)
    public (anyone with the URL)
    @acme.com (anyone at acme.com)
  ❯ Share with specific people...

? Enter emails and/or @domains (comma-separated):
  alice@example.com, @partner.com █
```

### Existing Custom Visibility

When project already has custom visibility configured, show it as the current selection:

```
? Visibility:
    private (only you)
    public (anyone with the URL)
    @acme.com (anyone at acme.com)
  ❯ alice@example.com, @partner.com (current)
    Share with specific people...
```

If user selects the current custom visibility line, they can edit it:

```
? Visibility:
  ❯ alice@example.com, @partner.com (current)

? Edit visibility (comma-separated):
  alice@example.com, @partner.com█
```

They can modify the list (add/remove) and press enter to save, or clear it entirely to switch to a different option.

### Global Default Update Prompts

After project config, if values differ from global:

```
Project configuration saved to .scratch/project.toml

? Set acme.com as your default namespace for new projects? (Y/n) █
? Set https://custom.scratch.dev as your default server? (Y/n) █

Global configuration updated.
```

### Validation Error Examples

```
? Project name: (my-project) MY-PROJECT
✖ Project name must be 3-63 characters, lowercase letters, numbers, and hyphens, starting with a letter

? Project name: (my-project) █
```

```
? Enter emails and/or @domains (comma-separated): not-an-email
✖ Invalid format. Use "public", "private", "@domain.com", or email addresses

? Enter emails and/or @domains (comma-separated): █
```

### Non-Project Directory Message

```
$ scratch cloud config /tmp/empty

No pages/ directory found at /tmp/empty
Configuring global Scratch Cloud settings instead.

? Server URL: ...
```

## Implementation Plan

### 1. Update Command Registration (`src/cmd/cloud/index.ts`)

Add path argument:
```typescript
cloud
  .command('config [path]')
  .description('Configure Scratch Cloud settings')
  .action(withErrorHandling('cloud config', async (projectPath?: string) => {
    await configCommand(projectPath)
  }))
```

### 2. Expand Config Interfaces

**Update `UserConfig`** in `src/cloud/user-config.ts`:
```typescript
export interface UserConfig {
  server_url?: string
  namespace?: string  // default namespace for new projects
}
```

**Update `ProjectConfig`** in `src/cmd/cloud/deploy.ts`:
```typescript
export interface ProjectConfig {
  name?: string
  namespace?: string
  server_url?: string   // overrides global
  visibility?: string   // Group as string
}
```

### 3. Rewrite `configCommand()` (`src/cmd/cloud/auth.ts`)

```
configCommand(projectPath: string = '.')
  |
  +-- Resolve path to absolute
  |
  +-- Require authentication (call requireAuth() like other cloud commands)
  |
  +-- Check if pages/ directory exists
  |     |
  |     +-- YES: Project config flow
  |     |
  |     +-- NO: Global config flow only
  |
  +-- Load existing configs:
  |     - projectConfig = loadProjectConfig(path)  [if project]
  |     - globalConfig = loadUserConfig()
  |
  +-- Run appropriate flow
```

### 4. Global Config Flow (no pages/ directory)

Prompt sequence:
1. **Server URL**
   - Default: `globalConfig.server_url` or `https://app.scratch.dev`
   - Validation: valid URL, https required (except localhost)

2. **Default Namespace**
   - Options: `@{userDomain}` (from email) or `global`
   - Default: `globalConfig.namespace` or `global`
   - Validation: `validateNamespaceForUser()`

Save to `~/.config/scratch/config.toml`

### 5. Project Config Flow (has pages/ directory)

**Config precedence:** project config > global config > hardcoded defaults

Prompt sequence:

1. **Project name**
   - Default: `projectConfig.name` || sanitized directory name
   - Validation: `validateProjectName()` from shared

2. **Namespace**
   - Options: `@{userDomain}` or `global`
   - Default: `projectConfig.namespace` || `globalConfig.namespace` || `global`
   - Validation: `validateNamespaceForUser()` from shared

3. **Server URL**
   - Default: `projectConfig.server_url` || `globalConfig.server_url` || `https://app.scratch.dev`
   - Validation: valid URL, https required (except localhost)

4. **Visibility**
   - Options via select:
     - `private` - "private (only you)"
     - `public` - "public (anyone with the URL)"
     - `@{userDomain}` - "{userDomain} (anyone at {userDomain})"
     - `Share with specific people...` - prompts for comma-separated emails/@domains
   - Default: `projectConfig.visibility` || `private`
   - Validation: `validateGroupInput()` from shared

### 6. Global Default Update Prompts

After project config, if values differ from global:

**Server URL:**
- If `globalConfig.server_url` unset OR differs from project value
- Prompt: "Set this as your default server for all projects?"

**Namespace:**
- If `globalConfig.namespace` unset OR differs from project value
- Prompt: "Set this as your default namespace for new projects?"

### 7. Create Config Templates

Add template files as reference documentation. These are NOT used for generation (see Section 8) - they're for users who run `scratch checkout _config/project.toml` to get a commented example.

**`template/_config/project.toml`:**
```toml
# Scratch Cloud Project Configuration
#
# This file configures how your project deploys to Scratch Cloud.
# Run `scratch cloud config` to update these settings interactively.

# Project name (required)
# Must be 3-63 characters, lowercase letters, numbers, and hyphens.
# This becomes part of your project URL.
name = "my-project"

# Namespace (required)
# Use "global" for the shared namespace, or your email domain (e.g., "acme.com")
# for a private namespace. Your project URL will be:
#   https://pages.scratch.dev/{namespace}/{name}/
namespace = "global"

# Scratch server URL (optional)
# Override the global default server. Usually you don't need to change this.
# server_url = "https://app.scratch.dev"

# Visibility (optional, defaults to "private")
# Controls who can view your deployed site:
#   "private"  - Only you (the owner)
#   "public"   - Anyone with the URL
#   "@acme.com" - Anyone with an @acme.com email
#   "user@example.com" - Specific email addresses
#   "user@x.com,@acme.com" - Comma-separated list
# visibility = "private"
```

**`template/_config/global.toml`:**
```toml
# Scratch Cloud Global Configuration
#
# These are your default settings for all Scratch projects.
# Run `scratch cloud config` from a non-project directory to update.
# Project-specific settings in .scratch/project.toml override these.

# Default server URL
# The Scratch Cloud server to deploy to.
server_url = "https://app.scratch.dev"

# Default namespace for new projects (optional)
# Use "global" for the shared namespace, or your email domain.
# namespace = "global"
```

### 8. Save Configs Using Templates

The existing `renderTemplate()` in `src/util.ts` only supports simple `{{var}}` substitution. We need to either:

**Option A: Extend `renderTemplate()`** to support mustache conditionals:
- `{{#field}}...{{/field}}` - render block if field is truthy
- `{{^field}}...{{/field}}` - render block if field is falsy/missing

**Option B: Use simpler templates** with just `{{var}}` and handle optional fields in code:
- Generate config string programmatically
- Only include optional fields if they have values
- Prepend comment header from template

**Recommended: Option B** - simpler, less magic, easier to maintain.

```typescript
// Escape string for TOML (handle quotes and backslashes)
function escapeTomlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function renderProjectConfig(config: ProjectConfig): string {
  const lines = [
    '# Scratch Cloud Project Configuration',
    '#',
    '# This file configures how your project deploys to Scratch Cloud.',
    '# Run `scratch cloud config` to update these settings interactively.',
    '',
    '# Project name (required)',
    `name = "${escapeTomlString(config.name)}"`,
    '',
    '# Namespace',
    `namespace = "${escapeTomlString(config.namespace)}"`,
  ]

  if (config.server_url) {
    lines.push('', '# Server URL (overrides global default)', `server_url = "${escapeTomlString(config.server_url)}"`)
  }

  if (config.visibility) {
    lines.push('', '# Visibility', `visibility = "${escapeTomlString(config.visibility)}"`)
  }

  return lines.join('\n') + '\n'
}
```

Note: While validators restrict most special characters, `escapeTomlString()` provides defense-in-depth against TOML injection.

### 9. Update Deploy to Use Project Config

**Update `src/cloud/api.ts` `deploy()` function:**

```typescript
export async function deploy(
  token: string,
  name: string,
  zipData: ArrayBuffer,
  namespace?: string | null,
  visibility?: string,
  serverUrl?: string  // NEW - override for project-specific server
): Promise<DeployCreateResponse> {
  const baseUrl = serverUrl || await getServerUrl()
  let query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
  if (visibility) {
    query += query ? '&' : '?'
    query += `visibility=${encodeURIComponent(visibility)}`
  }
  // Use baseUrl instead of calling getServerUrl() again
  // ... rest unchanged
}
```

**Update `src/cmd/cloud/deploy.ts`:**
- Load project config
- Pass `config.visibility` to `deploy()` call
- Pass `config.server_url` to `deploy()` call (if set, overrides global)

### 10. Update TOML Parsing/Generation

**`src/cloud/user-config.ts`:**
- Update `parseTOML()` to handle `namespace`
- Update `generateTOML()` to include `namespace`

**`src/cmd/cloud/deploy.ts`:**
- Update `loadProjectConfig()` to parse `server_url` and `visibility`
- Update `saveProjectConfig()` to write all fields

## Files to Modify

1. **`src/cmd/cloud/index.ts`** - Add `[path]` argument to config command
2. **`src/cmd/cloud/auth.ts`** - Rewrite `configCommand()` with full flow
3. **`src/cloud/user-config.ts`** - Add `namespace` field, use template for generation
4. **`src/cmd/cloud/deploy.ts`** - Add `server_url`/`visibility` to ProjectConfig, use template for generation
5. **`src/cloud/api.ts`** - Add `visibility` parameter to `deploy()`
6. **`src/template.ts`** - Exclude `_config/` from `materializeProjectTemplates()` and `listTemplateFiles()` (same as `_build/`)

## Files to Create

1. **`template/_config/project.toml`** - Project config reference with explanatory comments
2. **`template/_config/global.toml`** - Global config reference with explanatory comments

**These are hidden templates** (like `_build/`):
- NOT copied during `scratch create`
- NOT listed in `scratch checkout --list`
- Used by `cloud config` command to generate configs with comments

Update `src/template.ts` to treat `_config/` the same as `_build/`:
- `materializeProjectTemplates()` - exclude `_config/` paths
- `listTemplateFiles()` - exclude `_config/` paths

After adding templates, run `bun run compile-templates` (or `bun run build`) to regenerate `src/template.generated.ts`.

## Validation Summary

| Field | Shared Validator | Notes |
|-------|------------------|-------|
| `name` | `validateProjectName()` | 3-63 chars, lowercase, no reserved |
| `namespace` | `validateNamespaceForUser()` | Must match user's email domain |
| `visibility` | `validateGroupInput()` | public, private, @domain, emails |
| `server_url` | (CLI-only) | https required except localhost |

## Security Considerations

- All user inputs validated before saving to config
- Namespace restricted to user's email domain (server enforces this too)
- Server URL must be https (except localhost for dev)
- Visibility validated with same function server uses
- Authentication required before config (prevents guessing email domains)
- TOML strings escaped to prevent injection
- **Project server_url risk**: If a project's `.scratch/project.toml` contains a malicious `server_url`, the user's auth token would be sent to that server on deploy. Mitigations:
  - Users should only run `scratch cloud deploy` in trusted project directories
  - The server_url is visible in config and shown during deploy
  - Consider: warn user when project server_url differs from global?

## Testing Plan

### Unit Tests (`test/cloud/config.test.ts`)

**TOML parsing/generation:**
- Parse global config with all fields (server_url, namespace)
- Parse global config with missing fields (defaults applied)
- Parse project config with all fields (name, namespace, server_url, visibility)
- Parse project config with missing fields (partial config handled gracefully)
- Parse malformed TOML returns empty config (doesn't crash)
- Generate TOML preserves field order and comments
- Generate TOML escapes quotes and backslashes in values
- Round-trip: parse → modify → generate → parse yields same values

**Validation:**
- Project name validation (valid, invalid chars, too short, too long, reserved)
- Namespace validation (global, valid domain, invalid format, wrong user domain)
- Visibility validation (public, private, @domain, email, comma-separated list, invalid)
- Server URL validation (https, http localhost, http non-localhost rejected, invalid URL)

**Config precedence:**
- Project config overrides global config
- Global config overrides hardcoded defaults
- Missing project field falls back to global
- Missing global field falls back to hardcoded

### Unit Tests (`test/template.test.ts`)

**Hidden template behavior:**
- `materializeProjectTemplates()` does NOT copy `_config/` files
- `materializeProjectTemplates()` does NOT copy `_build/` files (existing behavior)
- `listTemplateFiles()` does NOT include `_config/` files
- `listTemplateFiles()` does NOT include `_build/` files (existing behavior)
- `getTemplateContent('_config/project.toml')` returns template content (explicit access works)
- `getTemplateContent('_config/global.toml')` returns template content (explicit access works)

### Integration Tests (`test/cloud/config.integration.test.ts`)

**Global config flow (no pages/):**
```bash
# Setup: temp directory without pages/
mkdir /tmp/test-config && cd /tmp/test-config

# Test: should prompt for global settings only
bun run src/index.ts cloud config .
# Verify: ~/.config/scratch/config.toml updated
```

**Project config flow (with pages/):**
```bash
# Setup: create scratch project
bun run src/index.ts create /tmp/test-project
cd /tmp/test-project

# Test: should prompt for project settings
bun run src/index.ts cloud config .
# Verify: .scratch/project.toml created with all fields
```

**Deploy uses visibility:**
```bash
# Setup: configure project with visibility
bun run src/index.ts cloud config .  # set visibility to @acme.com

# Test: deploy should pass visibility to server
bun run src/index.ts cloud deploy .
# Verify: server received visibility query param
```

### Manual Testing Checklist

**Prerequisites:**
- [ ] Logged in (`scratch cloud login`)
- [ ] Have a test project with `pages/` directory

**Global config (run from non-project directory):**
- [ ] `scratch cloud config /tmp/empty` prompts for server URL and namespace only
- [ ] Entering custom server URL saves to `~/.config/scratch/config.toml`
- [ ] Selecting namespace saves correctly
- [ ] Re-running shows previous values as defaults

**Project config (run from project directory):**
- [ ] `scratch cloud config .` prompts for all 4 fields (name, namespace, server_url, visibility)
- [ ] Project config saved to `.scratch/project.toml`
- [ ] Existing values shown as defaults on re-run
- [ ] Invalid project name shows error, re-prompts
- [ ] Invalid visibility shows error, re-prompts
- [ ] "Custom" visibility prompts for comma-separated input

**Global default update prompts:**
- [ ] After project config, prompted to update global server URL (if different)
- [ ] After project config, prompted to update global namespace (if different)
- [ ] Declining leaves global config unchanged
- [ ] Accepting updates global config

**Deploy integration:**
- [ ] `scratch cloud deploy` reads visibility from `.scratch/project.toml`
- [ ] Deployed project has correct visibility on server
- [ ] Changing visibility and re-deploying updates server
- [ ] `scratch cloud deploy` uses project's `server_url` if set (overrides global)
- [ ] Deploy to different server_url shows which server is being used

**Edge cases:**
- [ ] Non-TTY mode uses defaults without prompting
- [ ] Config command works without existing config files
- [ ] Handles malformed TOML gracefully (shows error, doesn't crash)

**Hidden templates (create/checkout):**
- [ ] `scratch create /tmp/test` does NOT create `_config/` directory
- [ ] `scratch checkout --list` does NOT show `_config/project.toml`
- [ ] `scratch checkout --list` does NOT show `_config/global.toml`
- [ ] `scratch checkout _config/project.toml` DOES work (explicit checkout)
- [ ] `scratch checkout _config/global.toml` DOES work (explicit checkout)
- [ ] Checked out config files contain explanatory comments
