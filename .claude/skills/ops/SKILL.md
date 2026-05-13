---
name: ops
description: "Manage server deployments, database operations, configuration syncing, and CLI builds for the Scratch monorepo using the bun ops CLI with instance-based targeting. Use when deploying to Cloudflare Workers, running database migrations, syncing environment variables, building or testing the CLI, or running integration tests against staging or production."
triggers:
  - deploy
  - deploy server
  - database migrate
  - sync config
  - config push
  - integration test
  - ops
  - ops CLI
  - build CLI
  - staging
  - production
  - server management
  - cloudflare workers
  - db query
  - bun ops
---

# Ops CLI Skill

The ops CLI (`bun ops`) manages server deployments, database operations, and CLI builds for the Scratch monorepo. Use when deploying to Cloudflare Workers, running database migrations, syncing environment variables, building the CLI, or running integration tests.

All commands run from the repository root.

## Common Workflows

### Verify changes end-to-end

Run the full integration test against staging (builds CLI, deploys server, runs e2e tests):

```bash
bun ops server -i staging test
```

### Deploy to production

```bash
bun ops server -i prod deploy
bun ops server -i prod logs           # Verify successful startup
```

### Update environment variables

Sync secrets to Cloudflare without redeploying:

```bash
bun ops server -i prod config push
bun ops server -i prod config check   # Verify config is consistent
```

### Check database state

```bash
bun ops server -i staging db tables
bun ops server -i staging db query "SELECT * FROM user LIMIT 5"
```

### View deployment logs

```bash
bun ops server -i staging logs
```

Test logs are saved to `logs/<instance>.log` during integration tests.

## Command Reference

### Server Commands (require `-i/--instance` flag)

Instance names: `prod`, `staging`, `dev`

```bash
# Deployment
bun ops server -i <instance> setup          # Interactive setup wizard for new instance
bun ops server -i <instance> deploy         # Deploy server to Cloudflare Workers
bun ops server -i <instance> logs           # Tail worker logs

# Configuration
bun ops server -i <instance> config check          # Validate config files
bun ops server -i <instance> config check --fix    # Show commands to fix issues
bun ops server -i <instance> config push           # Sync vars to Cloudflare secrets

# Database
bun ops server -i <instance> db migrate     # Run migrations from schema.d1.sql
bun ops server -i <instance> db tables      # List all tables
bun ops server -i <instance> db query "SQL" # Run arbitrary SQL query
bun ops server -i <instance> db drop-all    # Drop all tables (prod requires confirmation)

# Testing
bun ops server -i <instance> test           # Full end-to-end integration test
```

### Server Commands (no instance required)

```bash
bun ops server regenerate-env-ts    # Regenerate server/src/env.ts from .vars.example
```

### CLI Commands

```bash
bun ops cli build            # Build the scratch CLI
bun ops cli test             # Run all CLI tests (uses Bun's built-in parallelism)
bun ops cli test:unit        # Run unit tests only
bun ops cli test:e2e         # Run e2e tests only
bun ops cli run <script>     # Run any CLI script (pass-through)
```

## Instance Configuration

Each instance has configuration files in `server/`:
- `server/.${instance}.vars` - Environment variables (e.g., `.prod.vars`, `.staging.vars`)
- `server/wrangler.${instance}.toml` - Generated wrangler config

Resource naming convention: `${instance}-scratch-server`, `${instance}-scratch-db`, `${instance}-scratch-files`

## Deploy vs Config Push

**Important:** `deploy` and `config push` serve different purposes.

| Change Type | Command |
|-------------|---------|
| Code changes | `deploy` |
| Route changes (wrangler config) | `deploy` |
| Environment variable changes | `config push` only |
| Both routes AND env vars | `deploy` then `config push` |

- `deploy` updates code and routes but does NOT update secrets
- `config push` uses `wrangler secret put` to update secrets immediately without redeployment
