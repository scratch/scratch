# CLI Simplification Plan

## Current Commands

```sh
# =============================================================================
# Local commands
# =============================================================================

# Create a new Scratch project from template
scratch create [path]

# Bundle project into static website (output to dist/)
scratch build [path]

# Start local dev server with hot reload
scratch dev [path]

# Preview production build locally
scratch preview [path]

# Serve a specific file/directory on dev server (alias: view)
scratch watch [path]

# Remove build artifacts (dist/, .scratch/cache/)
scratch clean [path]

# Update scratch CLI to latest version
scratch update

# Clone a file/directory from built-in templates (alias: checkout, eject)
scratch pull [file]

# Configure local project settings (.scratch/project.toml)
# Prompts for: server URL (default if one, else choose or enter new), project name, visibility
# Uses same lib as publish for project configuration
scratch config

# =============================================================================
# Server commands
# =============================================================================

# Log in to a server (opens browser for OAuth)
# If server URL not provided: uses default if logged into one server, else prompts
scratch login [server-url]

# Log out from a server
# If server URL not provided: uses default if logged into one server, else prompts
scratch logout [server-url]

# Show current logged-in user for a server
# If server URL not provided: uses default if logged into one server, else prompts
scratch whoami [server-url]

# Configure Cloudflare Access service token for a protected server
# If server URL not provided: uses default if logged into one server, else prompts
scratch cf-access [server-url]

# Build and publish project to Scratch Cloud (alias: deploy)
# If .scratch/project.toml doesn't exist, runs config flow first (same lib as config command)
scratch publish [path]

# =============================================================================
# Project commands
# =============================================================================

# List all projects owned by current user
scratch projects list [server-url]

# Show details for a specific project
scratch projects info [name] [server-url]

# Delete a project and all its deploys
scratch projects delete [name] [server-url]

# =============================================================================
# Share commands
# =============================================================================

# Create a time-limited anonymous access URL
scratch share create [project]

# List all share tokens for a project
scratch share list [project]

# Revoke a share token
scratch share revoke <tokenId> [project]
```

## Notes

- Commands in `[brackets]` are optional arguments
- Commands in `<angle-brackets>` are required arguments
- [path] defaults to .
- [project] defaults to the project defined in ./.scratch/project.toml if it exists


## Simplifications

- Eliminate `cloud` command prefix - commands like `scratch cloud deploy` become `scratch deploy`, `scratch cloud projects list` becomes `scratch projects list`
- Separate commands into four groups in --help output: "Local commands", "Server commands", "Project commands", "Share commands"
- Rename `deploy` → `publish` (keep `deploy` as alias)
- Rename `checkout` → `pull` (keep `checkout` and `eject` as aliases)
- `config` now only configures local project settings (`.scratch/project.toml`), moved to Local commands
- `config` and `publish` share the same lib for project configuration flow
- `publish` automatically runs config flow if `.scratch/project.toml` doesn't exist
- Project config flow: choose server URL from logged-in servers (or enter new), then project name and visibility
- `login`, `logout`, `whoami` all accept optional `[server-url]` argument
- When logged into exactly one server, all server/cloud commands use that server by default (no prompt)
- When logged into multiple servers and no `[server-url]` provided, prompt user to choose
- Remove `config` prefix from `cf-access` → now `scratch cf-access [server-url]`
- Remove global config (`_config/global.toml`) and all supporting code - only project config (`.scratch/project.toml`) remains
