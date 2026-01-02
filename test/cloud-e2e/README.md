# Cloud E2E Tests

End-to-end tests for the scratch cloud functionality.

## Prerequisites

1. **Build the scratch CLI:**
   ```bash
   bun run build
   ```

2. **Start the local server** (in scratch-server repo):
   ```bash
   cd ../scratch-server
   bun run ops deploy:local
   ```

3. **Get an API token:**
   ```bash
   # Login (opens browser for OAuth)
   ./dist/scratch cloud login

   # Create an API token for testing
   ./dist/scratch cloud tokens create -n e2e-test

   # Either export the token or paste it when prompted
   export SCRATCH_TEST_TOKEN=<your-token>
   ```

## Running Tests

```bash
# Run the public deploy test
bun run test:cloud-e2e

# Run the private deploy test
bun run test:cloud-e2e:private

# Run all cloud E2E tests
bun run test:cloud-e2e:all

# With debug output
SCRATCH_DEBUG=1 ./test/cloud-e2e/cloud-deploy.sh

# Against a different server
SCRATCH_SERVER=https://app.scratch.dev ./test/cloud-e2e/cloud-deploy.sh
```

## Test Scripts

### `cloud-deploy.sh`

Full end-to-end deploy workflow for **public** projects:
1. Checks prerequisites (executable, server, token)
2. Sets up credentials from the test token
3. Creates a temp scratch project with test content
4. Runs `scratch cloud deploy`
5. Verifies the deployment via API
6. Cleans up temp files

### `cloud-private-deploy.sh`

End-to-end test for **private** project access control:
1. Deploys a private project (view_access: authenticated)
2. Verifies unauthenticated access redirects to app domain
3. Verifies authenticated user can get a signed URL
4. Verifies signed URL grants access to content
5. Verifies invalid token cannot get signed URL
6. Verifies no token cannot get signed URL

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRATCH_SERVER` | App server URL | `http://localhost:8788` |
| `SCRATCH_PAGES` | Pages server URL | `http://localhost:8787` |
| `SCRATCH_TEST_TOKEN` | API token for auth | (prompts if not set) |
| `SCRATCH_DEBUG` | Enable verbose output | (unset) |
