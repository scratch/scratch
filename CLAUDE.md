# Agent Notes

Notes for AI agents working with this repository.

## Repository Structure

```
scratch/
├── cli/              # CLI tool for building static MDX sites (see cli/CLAUDE.md)
│   ├── src/
│   │   ├── cmd/      # CLI command handlers
│   │   ├── build/    # Build pipeline (step-based orchestrator)
│   │   └── cloud/    # Cloud deployment commands
│   ├── template/     # Embedded project templates
│   └── test/         # Unit and e2e tests
├── server/           # Cloudflare Worker (see server/CLAUDE.md)
│   ├── src/
│   │   ├── routes/   # API routes split by domain
│   │   └── lib/      # Shared utilities
│   └── schema.d1.sql # Database schema (D1/SQLite)
├── shared/           # Types shared between server and client
├── ops/              # CLI for dev operations
├── website/          # Scratch documentation site (itself a Scratch project)
└── plan/             # Implementation plans
```

**Note:** The `website/` directory is a Scratch project (dogfooding) that gets published to scratch.dev. It has its own `CLAUDE.md` documenting how to work with it as a Scratch site. For contributing to the Scratch CLI/server codebase, refer to this document.

## CLI Overview

The CLI builds static MDX-based websites. Users create `.md`/`.mdx` files in `pages/` with custom React components, and the CLI compiles them into a static site.

Key commands: `scratch create`, `scratch build`, `scratch dev`, `scratch publish`, `scratch projects`

For detailed CLI documentation, see `cli/CLAUDE.md`.

## Instance-Based Configuration

Server ops commands use `-i/--instance` flag (e.g., `prod`, `staging`, `dev`). Each instance has:
- `server/.${instance}.vars` - Environment variables
- `server/wrangler.${instance}.toml` - Generated wrangler config

## Skills

Use these skills for common operations:

- **ops** - Server deployment, database operations, testing commands
- **release** - Version bumps and releases for CLI and server
- **cli-dev** - Patterns for CLI development

## Verifying Changes

Run the full integration test against staging:
```bash
bun ops server -i staging test
```

This builds the CLI, deploys the server, and runs end-to-end tests. See the ops skill for more details.

## Environment Variables

Configuration uses `.vars` files (gitignored):
- `server/.vars.example` - Template with all variables and documentation
- `server/.${instance}.vars` - Instance-specific values

Secrets are synced to Cloudflare via `bun ops server -i <instance> config push`.

### Deploy vs Config Push

**Important:** Use `deploy` for code/route changes, use `config push` for environment variable changes. They serve different purposes.

- `bun ops server -i <instance> deploy` - Deploys worker code and wrangler config (routes, bindings). Required when code changes or routes change.
- `bun ops server -i <instance> config push` - Syncs secrets/environment variables to the running worker via `wrangler secret put`. Takes effect immediately without redeployment.

When to use each:
- **Code changes** → `deploy`
- **Route changes** (adding/removing domains in wrangler config) → `deploy`
- **Environment variable changes** → `config push` only (no deploy needed)

Note: `deploy` does NOT update secrets. If you change both routes and env vars, you need both `deploy` AND `config push`.

## Authentication Architecture

The server uses two subdomains with **isolated authentication** for security:

- **App subdomain** (`app.example.com`) - API endpoints, OAuth login, session management
- **Content subdomain** (`pages.example.com`) - Serves user-uploaded static files

### Why Cookies Are NOT Shared Between Subdomains

The content subdomain serves **user-uploaded JavaScript** which could be malicious. If session cookies were shared across subdomains (via `domain=.example.com`), an attacker could:

1. Upload a project containing malicious JS
2. Trick a victim into visiting the project
3. The malicious JS makes authenticated API requests to `app.example.com/api/*`
4. Even though CORS blocks reading responses, destructive actions (DELETE, etc.) succeed

To prevent this, session cookies are scoped to the **app subdomain only**.

### Content Tokens (Private Content Access)

Since cookies aren't shared, private content on the pages subdomain uses **project-scoped content tokens**:

```
1. User visits pages.example.com/_/private-project/
2. No valid token → redirect to app.example.com/auth/content-access?project_id=...&return_url=...
3. App verifies user session + project access
4. App generates JWT: {sub: userId, email, pid: projectId, exp: 1hour}
5. Redirect back to pages with ?_ctoken=<jwt>
6. Pages validates token, sets path-scoped cookie, serves content
7. Subsequent requests use cookie (no redirect needed)
```

**Why project-scoped?** A user-scoped token would let an attacker on project1 steal access to project2. Project-scoped tokens are useless for accessing other projects.

Key files:
- `server/src/lib/content-token.ts` - JWT create/verify functions
- `server/src/routes/app/auth.ts` - `/auth/content-access` endpoint
- `server/src/routes/pages.ts` - Token validation and cookie handling

For additional security invariants, see `server/CLAUDE.md`.

### App Subdomain Authentication

Two modes supported (set via `AUTH_MODE` env var):

**1. BetterAuth mode (default)** - Google OAuth
- Session stored in `session` table, cookie on app subdomain
- Login: `/auth/login` → Google OAuth → callback → session cookie
- API requests: Session cookie or Bearer token

**2. Cloudflare Access mode** - For private deployments
- CF Access handles authentication at edge
- Server validates CF JWT, auto-creates user records
- No OAuth, no session cookies needed

### CLI Authentication (Device Authorization Flow)

The CLI uses RFC 8628 device authorization:

```
1. CLI calls POST /auth/device/code → gets device_code + user_code
2. CLI displays user_code, opens browser to /device?user_code=...
3. User logs in (if needed) and approves the device
4. CLI polls POST /auth/device/token until approved
5. CLI receives Bearer token, stores in ~/.scratch/credentials.json
```

The Bearer token is used for all subsequent API requests.

Key files:
- `server/src/auth.ts` - BetterAuth config with device authorization plugin
- `server/src/routes/app/ui.ts` - Device approval UI

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

Token resolution priority: `SCRATCH_TOKEN` (env var or .env) > `~/.scratch/credentials.json`

API tokens are:
- Hashed in the database (only shown once at creation)
- Optionally time-limited (recommended for CI)
- Revocable via `scratch tokens revoke <name>`
- Scoped to the user who created them
- **Only valid on the app subdomain** - API tokens do NOT grant access to the content domain (this is a security invariant to prevent malicious user-uploaded JS from using stolen tokens)
- **Compatible with Cloudflare Access** - When the server is behind CF Access, configure a service token via `scratch cf-access`, then API tokens work normally (the CLI sends both CF Access headers and the API key)

Key files:
- `server/src/auth.ts` - BetterAuth apiKey plugin configuration
- `cli/src/cmd/cloud/tokens.ts` - Token management commands

### Modifying Authentication Code

We strive to offload as much of the authentication logic to Better Auth as possible. Before making any changes to an auth workflow:

1. Find and read all applicable Better Auth documentation: https://www.better-auth.com/llms.txt
2. Read the security model in `server/CLAUDE.md`
3. Explain the proposed changes to the user and verify they are directionally correct before implementing

## Shared Types

Import paths:
```typescript
import { ... } from '@scratch/shared'           // visibility + API types
import { ... } from '@scratch/shared/project'   // project validation
import { ... } from '@scratch/shared/api'       // API response types only
import { ... } from '@scratch/shared/visibility' // visibility only
```
