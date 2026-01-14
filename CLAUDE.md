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
├── server/           # Cloudflare Worker (Hono framework)
│   ├── src/
│   │   ├── routes/   # API routes split by domain
│   │   │   ├── api/  # /api/* endpoints (projects, deploys, users)
│   │   │   ├── auth.ts
│   │   │   ├── pages.ts
│   │   │   └── ui.ts
│   │   ├── lib/      # Shared utilities
│   │   └── env.ts    # TypeScript env interface (auto-generated)
│   ├── wrangler.template.toml  # Template for generating instance configs
│   └── .vars.example           # Example/template for instance vars
├── shared/           # Types shared between server and client
│   └── src/
│       ├── api/      # API response types
│       ├── project.ts
│       └── visibility.ts
├── ops/              # CLI for dev operations
│   ├── index.ts      # Entry point
│   ├── commands/     # Command implementations
│   └── lib/          # Shared utilities (config parsing, etc.)
└── plan/             # Implementation plans
```

## CLI Overview

The `cli/` directory contains the Scratch CLI - a tool for building static MDX-based websites. Users create `.md` and `.mdx` files in a `pages/` directory with custom React components, and the CLI compiles them into a static site.

Key commands:
- `scratch create` - Create new project
- `scratch build` - Build static site
- `scratch dev` - Development server with hot reload
- `scratch cloud deploy` - Deploy to Scratch Cloud

**For detailed CLI documentation, see `cli/CLAUDE.md`.**

Client credentials are stored at `~/.scratch/credentials.json`.

## Instance-Based Configuration

Server ops commands use `-i/--instance` flag (e.g., `prod`, `staging`, `dev`). Each instance has:
- `server/.${instance}.vars` - Environment variables (e.g., `.prod.vars`)
- `server/wrangler.${instance}.toml` - Generated wrangler config

Resource names are derived from the instance: `${instance}-scratch-server`, `${instance}-scratch-db`, `${instance}-scratch-files`.

## Key Commands

```bash
# Git workflow (uses Claude to generate descriptions)
bun ops commit                              # Commit all changes with AI-generated message
bun ops pr                                  # Create PR with AI-generated description
bun ops cli release [patch|minor|major]     # Release CLI (creates cli-v* tag)
bun ops server release [patch|minor|major]  # Release server (creates server-v* tag)

# Server commands (use -i flag for instance)
bun ops server -i <instance> setup          # Interactive setup wizard
bun ops server -i <instance> deploy         # Deploy to Cloudflare Workers
bun ops server -i <instance> logs           # Tail worker logs

# Database
bun ops server -i <instance> db migrate     # Run migrations from schema.sql
bun ops server -i <instance> db tables      # List tables
bun ops server -i <instance> db query "SQL" # Run arbitrary SQL
bun ops server -i <instance> db drop-all    # Drop all tables (prod requires confirmation)

# Configuration
bun ops server -i <instance> config check [--fix]  # Validate config files and secrets
bun ops server -i <instance> config push    # Sync vars to Cloudflare secrets

# Server utilities (no instance required)
bun ops server regenerate-env-ts            # Regenerate env.ts from .vars.example

# CLI commands
bun ops cli build                           # Build the scratch CLI
bun ops cli build:all                       # Build for all platforms
bun ops cli test                            # Run CLI tests
bun ops cli test:unit                       # Run unit tests only
bun ops cli test:e2e                        # Run e2e tests only

# Development (run from server/ directory)
cd server && bun run dev                    # Start local dev server
```

## Running Tests

**The best way to verify that changes to the CLI or server are correct is to run a full integration test:**
```bash
bun ops server -i staging test
```

### Integration test (end-to-end against a deployed instance)
```bash
bun ops server -i staging test    # Run integration test against staging
bun ops server -i prod test       # Run integration test against prod
```

This runs a complete end-to-end test:
1. Builds the CLI
2. Runs migrations on the instance
3. Deploys server to the instance
4. Starts tailing logs in background (writes to `logs/<instance>.log`)
5. Logs in with CLI (interactive if needed)
6. Creates a scratch project in temp directory
7. Deploys project to the instance
8. Verifies deployed content matches local build
9. Cleans up test project

The test reads domain configuration from `server/.<instance>.vars` (BASE_DOMAIN, APP_SUBDOMAIN, CONTENT_SUBDOMAIN).

**Viewing test logs:** Server logs during the test are saved to `logs/<instance>.log`. View with:
```bash
cat logs/staging.log
```

### CLI tests
```bash
bun ops cli test          # Run all CLI tests (builds first via pretest)
bun ops cli test:unit     # Unit tests only
bun ops cli test:e2e      # E2E tests only
```

## Testing Against Production

Full automated tests require `TEST_MODE=true` which isn't enabled in production. However, if already logged in via CLI, you can manually test:

```bash
# Check CLI auth
scratch cloud whoami

# List projects
scratch cloud projects

# Test API directly
curl -H "Authorization: Bearer <token>" https://<APP_SUBDOMAIN>.<BASE_DOMAIN>/api/me
curl -H "Authorization: Bearer <token>" https://<APP_SUBDOMAIN>.<BASE_DOMAIN>/api/projects
```

Token can be read from `~/.scratch/credentials.json`. Domain config is in `server/.${instance}.vars`.

## Environment Variables

Configuration uses `.vars` files (gitignored):
- `server/.vars.example` - Template with all variables and documentation
- `server/.${instance}.vars` - Instance-specific values (created by `bun ops server -i <instance> setup`)

Secrets are synced to Cloudflare via `bun ops server -i <instance> config push`.

See `server/.vars.example` for all required variables including:
- Domain configuration (BASE_DOMAIN, APP_SUBDOMAIN, CONTENT_SUBDOMAIN)
- Authentication (BETTER_AUTH_SECRET, AUTH_MODE, Google OAuth or Cloudflare Access)
- Access control (ALLOWED_USERS, MAX_VISIBILITY)
- Resource IDs (D1_DATABASE_ID)

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
- `server/src/ui/pages/device-approval.ts` - Approval page HTML

### Modifying Authentication Code

We strive to offload as much of the authentication logic to Better Auth as possible. Before making any changes to the an auth workflow:

1. Find and read all applicable Better Auth documentation: https://www.better-auth.com/llms.txt
2. Read this CLAUDE.md to understand why specific auth choices were made. Don't assume these decisions were correct, but understand the rationale before proposing changes.
3. Explain the proposed changes to the user and verify they are directionally correct before implementing.

## Shared Types

Import paths:
```typescript
import { ... } from '@scratch/shared'           // visibility + API types
import { ... } from '@scratch/shared/project'   // project validation
import { ... } from '@scratch/shared/api'       // API response types only
import { ... } from '@scratch/shared/visibility' // visibility only
```
