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

**Note:** Tests automatically create and clean up their own test users via `/api/test/*` endpoints. No manual authentication is required.

## Running Tests

```bash
# Run the public deploy test
bun run test:cloud-e2e

# Run the private deploy test
bun run test:cloud-e2e:private

# Run the org access control test
bun run test:cloud-e2e:org

# Run the account/org creation test
bun run test:cloud-e2e:account

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
1. Creates a test user via `/api/test/users`
2. Sets up credentials for the CLI
3. Creates a temp scratch project with test content
4. Runs `scratch cloud deploy`
5. Verifies the deployment via API
6. Cleans up temp files and test user

### `cloud-private-deploy.sh`

End-to-end test for **private** project access control:
1. Creates a test user and deploys a private project (view_access: authenticated)
2. Verifies unauthenticated access redirects to app domain
3. Verifies authenticated user can get a signed URL
4. Verifies signed URL grants access to content
5. Verifies invalid token cannot get signed URL
6. Verifies no token cannot get signed URL

### `cloud-org-access.sh`

End-to-end test for **org access control**:
1. Creates a test user via `/api/test/users`
2. Verifies org name format (email with `@` replaced by `.`, e.g., `koomen@gmail.com` → `koomen.gmail.com`)
3. Verifies user can create projects in their personal org
4. Verifies user can list projects in their personal org
5. Verifies user CANNOT create projects in other orgs (403)
6. Verifies user CANNOT list projects in other orgs (403)
7. Tests domain org access for hosted domain users

### `cloud-account-org.sh`

End-to-end test for **account creation and org assignment**:
1. Personal account creates org with `email.domain` format (e.g., `user@gmail.com` → `user.gmail.com`)
2. Hosted domain account creates org with domain name (e.g., `user@acme.corp` with hd=`acme.corp` → `acme.corp`)
3. Second hosted domain user joins existing org (not creates new one)
4. Personal org collision is rejected when org name already exists
5. Users can only access their own orgs (personal org or shared hosted domain org)
6. Hosted domain users can see each other's projects in shared org

**Note:** All tests use `/api/test/*` endpoints which are only available in non-production mode.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRATCH_SERVER` | App server URL | `http://localhost:8788` |
| `SCRATCH_PAGES` | Pages server URL | `http://localhost:8787` |
| `SCRATCH_DEBUG` | Enable verbose output | (unset) |
