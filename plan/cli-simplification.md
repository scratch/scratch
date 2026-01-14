# CLI Simplification Plan

## Current Commands

```sh
# =============================================================================
# Top-level commands
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

# Clone a file/directory from built-in templates (alias: eject)
scratch checkout [file]

# =============================================================================
# Cloud commands: scratch cloud <command>
# =============================================================================

# Log in to Scratch Cloud (opens browser for OAuth)
scratch login

# Log out from Scratch Cloud
scratch logout

# Show current logged-in user
scratch whoami

# Configure server URL and project settings interactively
scratch config

# Configure Cloudflare Access service token for protected servers
scratch cf-access

# Build and deploy project to Scratch Cloud
scratch deploy [path]








# =============================================================================
# Cloud commands: scratch cloud <command>
# =============================================================================

# Log in to Scratch Cloud (opens browser for OAuth)
scratch cloud login

# Log out from Scratch Cloud
scratch cloud logout

# Show current logged-in user
scratch cloud whoami

# Configure server URL and project settings interactively
scratch cloud config

# Configure Cloudflare Access service token for protected servers
scratch cloud cf-access

# Build and deploy project to Scratch Cloud
scratch cloud deploy [path]

# =============================================================================
# Cloud project commands: scratch cloud projects <command>
# =============================================================================

# List all projects owned by current user
scratch cloud projects list

# Show details for a specific project
scratch cloud projects info [name]

# Delete a project and all its deploys
scratch cloud projects delete [name]

# =============================================================================
# Cloud share commands: scratch cloud share <command>
# =============================================================================

# Create a time-limited anonymous access URL
scratch cloud share create [project]

# List all share tokens for a project
scratch cloud share list [project]

# Revoke a share token
scratch cloud share revoke <tokenId> [project]
```

## Notes

- Commands in `[brackets]` are optional arguments
- Commands in `<angle-brackets>` are required arguments
- Most cloud commands read from `.scratch/project.toml` if no project name specified

## Ideas for Simplification

- `scratch watch` should make path argument optional, defaulting to `.`
- `scratch watch` should ignore gitignored files
