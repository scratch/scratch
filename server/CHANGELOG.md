# Changelog

All notable changes to the Scratch Server will be documented in this file.

## [0.1.2] - 2026-01-14

This release simplifies CLI authentication by replacing the device code flow with a streamlined browser-based login.

### Improvements

- **Simplified CLI authentication**: Replaced the RFC 8628 device code flow with a simpler browser-based flow. The CLI now opens a browser directly to `/cli-login` where users verify a short code and approve the login. This eliminates polling logic, reduces complexity, and works seamlessly with both BetterAuth and Cloudflare Access authentication modes.

## [0.1.1] - 2026-01-14

This release simplifies project URLs by replacing namespaces with owner-based paths, and improves Cloudflare Access authentication for CLI users.

### Features

- **Simplified project URLs**: Projects are now accessed via owner identifier instead of namespace (e.g., `/pete/my-app/` or `/user123/my-app/`). Owner can be identified by user ID, email, or email local part (when a single domain is configured in `ALLOWED_USERS`).
- **Streamlined CLI login for Cloudflare Access**: Added `/cli-login` endpoint that bypasses the device code flow when using Cloudflare Access authentication, directly authenticating and redirecting to the CLI.
- **Auto-approve device flow in CF Access mode**: The `/device` endpoint now automatically approves and redirects to localhost callback when `AUTH_MODE=cloudflare-access`, eliminating the manual approval step.

### Improvements

- Added support for `cf-access-token` header for CLI requests behind Cloudflare Access
- Bearer token authentication now works correctly in Cloudflare Access mode by directly querying the session database
- Added `CLOUDFLARE_ACCOUNT_ID` to configuration template for multi-account deployments

### Breaking Changes

- Removed namespace concept from projects - projects are now uniquely identified by name + owner
- Project URLs changed from `/{namespace}/{project}/` to `/{owner}/{project}/`
- Removed `GLOBAL_NAMESPACE_URL` configuration option
- API responses now return `urls` object with `primary` and `byId` URLs instead of single `url` field
- Database schema changed: `projects` table no longer has `namespace` column, now uses `owner_id` for uniqueness
