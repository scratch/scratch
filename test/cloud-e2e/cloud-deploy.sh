#!/bin/bash
#
# End-to-end test for scratch cloud deploy workflow
#
# Prerequisites:
#   - scratch executable built (bun run build)
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-deploy.sh
#
# Environment variables:
#   SCRATCH_SERVER - Server URL (default: http://localhost:8788)
#   SCRATCH_DEBUG  - Set to 1 for verbose output

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRATCH_BIN="$REPO_ROOT/dist/scratch"
SERVER_URL="${SCRATCH_SERVER:-http://localhost:8788}"
PAGES_URL="${SCRATCH_PAGES:-http://localhost:8787}"

# Generate unique identifiers for this test run
TIMESTAMP=$(date +%s)
TEST_EMAIL="deploy-test-${TIMESTAMP}@gmail.com"
TEST_PROJECT="e2e-test-${TIMESTAMP}"
TEMP_DIR=""

# Will be set after user creation
TEST_TOKEN=""
USER_ORG=""

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    log_info "Cleaning up..."

    # Clean up temp directory
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi

    # Delete test user
    if [ -n "$TEST_EMAIL" ]; then
        ENCODED_EMAIL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEST_EMAIL'))")
        curl -s -X DELETE "$SERVER_URL/api/test/users/$ENCODED_EMAIL" > /dev/null 2>&1 || true
    fi

    log_info "Cleanup complete"
}

trap cleanup EXIT

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if scratch executable exists
    if [ ! -x "$SCRATCH_BIN" ]; then
        log_error "Scratch executable not found at $SCRATCH_BIN"
        log_error "Run 'bun run build' first"
        exit 1
    fi

    # Check if server is reachable
    if ! curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/api/health" | grep -q "200"; then
        log_error "Server at $SERVER_URL is not reachable"
        log_error "Start the local server: cd ../scratch-server && bun run ops deploy:local"
        exit 1
    fi

    # Check if test endpoints are available (non-production mode)
    # Note: Must use gmail.com since personal accounts with custom domains are rejected
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"email": "probe@gmail.com"}' \
        "$SERVER_URL/api/test/users")

    if [ "$HTTP_CODE" = "403" ]; then
        log_error "Test endpoints not available - server is in production mode"
        exit 1
    fi

    # Clean up probe user
    curl -s -X DELETE "$SERVER_URL/api/test/users/probe%40gmail.com" > /dev/null 2>&1 || true

    log_info "Prerequisites check passed"
}

create_test_user() {
    log_info "Creating test user: $TEST_EMAIL"

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$TEST_EMAIL\", \"name\": \"Deploy Test User\"}" \
        "$SERVER_URL/api/test/users")

    if echo "$RESPONSE" | grep -q '"error"'; then
        log_error "Failed to create test user"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    TEST_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    # Extract org name from the "org":{...,"name":"..."} object
    USER_ORG=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$TEST_TOKEN" ]; then
        log_error "No token returned"
        exit 1
    fi

    log_info "Test user created (org: $USER_ORG)"
}

setup_credentials() {
    log_info "Setting up credentials..."

    # Create credentials directory
    CREDS_DIR="$HOME/.scratch"
    mkdir -p "$CREDS_DIR"

    # Get user info
    USER_RESPONSE=$(curl -s -H "Authorization: Bearer $TEST_TOKEN" "$SERVER_URL/api/me")

    USER_ID=$(echo "$USER_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    USER_EMAIL=$(echo "$USER_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    USER_NAME=$(echo "$USER_RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "")

    # Write credentials file
    cat > "$CREDS_DIR/credentials.json" << EOF
{
  "token": "$TEST_TOKEN",
  "user": {
    "id": "$USER_ID",
    "email": "$USER_EMAIL",
    "name": "$USER_NAME",
    "org": "$USER_ORG"
  },
  "server": "$SERVER_URL"
}
EOF

    # Write config file with server URL
    cat > "$CREDS_DIR/config.toml" << EOF
serverUrl = "$SERVER_URL"
EOF

    log_info "Credentials configured"
}

create_test_project() {
    log_info "Creating test project in temp directory..."

    TEMP_DIR=$(mktemp -d)
    log_info "Temp directory: $TEMP_DIR"

    # Create a minimal scratch project
    mkdir -p "$TEMP_DIR/pages"

    # Create index.mdx
    cat > "$TEMP_DIR/pages/index.mdx" << 'EOF'
---
title: E2E Test Project
description: Automated end-to-end test
---

# E2E Test Project

This is an automated test project created at: {new Date().toISOString()}

## Test Content

- Item 1
- Item 2
- Item 3
EOF

    # Create a second page
    cat > "$TEMP_DIR/pages/about.mdx" << 'EOF'
---
title: About
---

# About This Test

This page tests multi-page deployments.
EOF

    log_info "Test project created with 2 pages"
}

run_deploy() {
    log_info "Running scratch cloud deploy..."

    cd "$TEMP_DIR"

    # Run deploy with the test project name
    if [ -n "$SCRATCH_DEBUG" ]; then
        "$SCRATCH_BIN" cloud deploy --project "$TEST_PROJECT" -v
    else
        "$SCRATCH_BIN" cloud deploy --project "$TEST_PROJECT" 2>&1 | tee /tmp/deploy-output.txt
    fi

    DEPLOY_EXIT=$?

    if [ $DEPLOY_EXIT -ne 0 ]; then
        log_error "Deploy command failed with exit code $DEPLOY_EXIT"
        cat /tmp/deploy-output.txt 2>/dev/null || true
        exit 1
    fi

    log_info "Deploy completed successfully"
}

verify_deployment() {
    log_info "Verifying deployment..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")

    # Get project info via API
    PROJECT_RESPONSE=$(curl -s -H "Authorization: Bearer $TEST_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_ORG/projects/$TEST_PROJECT")

    if echo "$PROJECT_RESPONSE" | grep -q "error"; then
        log_error "Failed to get project info"
        log_error "Response: $PROJECT_RESPONSE"
        exit 1
    fi

    # Check that current_version is > 0
    VERSION=$(echo "$PROJECT_RESPONSE" | grep -o '"current_version":[0-9]*' | cut -d':' -f2)

    if [ -z "$VERSION" ] || [ "$VERSION" -eq 0 ]; then
        log_error "Project has no deployments (current_version: $VERSION)"
        exit 1
    fi

    log_info "Project deployed successfully (version: $VERSION)"

    # Get project URL and verify it's accessible
    PROJECT_URL=$(echo "$PROJECT_RESPONSE" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$PROJECT_URL" ]; then
        log_info "Project URL: $PROJECT_URL"

        # Try to fetch the deployed site
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PROJECT_URL" 2>/dev/null || echo "000")

        if [ "$HTTP_CODE" = "200" ]; then
            log_info "Deployed site is accessible (HTTP $HTTP_CODE)"
        else
            log_warn "Could not verify deployed site (HTTP $HTTP_CODE) - pages domain may not be running"
        fi
    fi
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}E2E Deploy Test Passed!${NC}"
    echo "========================================="
    echo "Server:  $SERVER_URL"
    echo "Project: $TEST_PROJECT"
    echo "Org:     $USER_ORG"
    echo ""
}

# Main execution
main() {
    echo "========================================="
    echo "Scratch Cloud E2E Deploy Test"
    echo "========================================="
    echo ""

    check_prerequisites
    create_test_user
    setup_credentials
    create_test_project
    run_deploy
    verify_deployment
    print_summary
}

main "$@"
