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
# Run the deploy test
./test/cloud-e2e/cloud-deploy.sh

# With debug output
SCRATCH_DEBUG=1 ./test/cloud-e2e/cloud-deploy.sh

# Against a different server
SCRATCH_SERVER=https://app.scratch.dev ./test/cloud-e2e/cloud-deploy.sh
```

## Test Scripts

### `cloud-deploy.sh`

Full end-to-end deploy workflow:
1. Checks prerequisites (executable, server, token)
2. Sets up credentials from the test token
3. Creates a temp scratch project with test content
4. Runs `scratch cloud deploy`
5. Verifies the deployment via API
6. Cleans up temp files

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRATCH_SERVER` | Server URL | `http://localhost:8788` |
| `SCRATCH_TEST_TOKEN` | API token for auth | (prompts if not set) |
| `SCRATCH_DEBUG` | Enable verbose output | (unset) |
