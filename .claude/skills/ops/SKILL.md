# Ops CLI Skill

The ops CLI (`bun ops`) manages server deployments, database operations, and CLI builds for the Scratch monorepo.

## Command Structure

All commands are run from the repository root with `bun ops`.

### Server Commands (require `-i/--instance` flag)

Instance names: `prod`, `staging`, `dev`

```bash
# Setup and deployment
bun ops server -i <instance> setup          # Interactive setup wizard for new instance
bun ops server -i <instance> deploy         # Deploy server to Cloudflare Workers
bun ops server -i <instance> logs           # Tail worker logs

# Configuration management
bun ops server -i <instance> config check          # Validate config files
bun ops server -i <instance> config check --fix    # Show commands to fix issues
bun ops server -i <instance> config push           # Sync vars to Cloudflare secrets

# Database operations
bun ops server -i <instance> db migrate     # Run migrations from schema.d1.sql
bun ops server -i <instance> db tables      # List all tables
bun ops server -i <instance> db query "SQL" # Run arbitrary SQL query
bun ops server -i <instance> db drop-all    # Drop all tables (prod requires confirmation)

# Integration testing
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

## Common Workflows

### Verify changes are correct
Run the full integration test against staging:
```bash
bun ops server -i staging test
```

This builds the CLI, deploys the server, and runs end-to-end tests.

### Deploy to production
```bash
bun ops server -i prod deploy
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

## Instance Configuration

Each instance has configuration files in `server/`:
- `server/.${instance}.vars` - Environment variables (e.g., `.prod.vars`, `.staging.vars`)
- `server/wrangler.${instance}.toml` - Generated wrangler config

Resource naming convention: `${instance}-scratch-server`, `${instance}-scratch-db`, `${instance}-scratch-files`

## Deploy vs Config Push

**Important:** `deploy` and `config push` serve different purposes. Use the right one for the job.

| Change Type | Command |
|-------------|---------|
| Code changes | `deploy` |
| Route changes (wrangler config) | `deploy` |
| Environment variable changes | `config push` only |
| Both routes AND env vars | `deploy` then `config push` |

- `deploy` updates code and routes but does NOT update secrets
- `config push` uses `wrangler secret put` to update secrets immediately without redeployment
