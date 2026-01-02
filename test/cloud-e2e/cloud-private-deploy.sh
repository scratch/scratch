#!/bin/bash
#
# End-to-end test for scratch cloud private project deploy workflow
#
# Tests:
#   1. Deploy a private project (view_access: authenticated)
#   2. Verify unauthenticated access redirects to app domain
#   3. Verify authenticated user can get a signed URL
#   4. Verify signed URL grants access to content
#   5. Verify invalid token cannot get signed URL
#
# Prerequisites:
#   - scratch executable built (bun run build)
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-private-deploy.sh

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
TEST_EMAIL="private-test-${TIMESTAMP}@testmail.com"
TEST_PROJECT="e2e-private-${TIMESTAMP}"
TEMP_DIR=""

# Will be set after user creation
TEST_TOKEN=""
USER_ORG=""
VALID_SIGNED_URL=""

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
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

    # Check if pages server is reachable
    if ! curl -s -o /dev/null -w "%{http_code}" "$PAGES_URL/health" | grep -q "200"; then
        log_error "Pages server at $PAGES_URL is not reachable"
        log_error "Start the local server: cd ../scratch-server && bun run ops deploy:local"
        exit 1
    fi

    # Check if test endpoints are available (non-production mode)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"email": "probe@test.com"}' \
        "$SERVER_URL/api/test/users")

    if [ "$HTTP_CODE" = "403" ]; then
        log_error "Test endpoints not available - server is in production mode"
        exit 1
    fi

    # Clean up probe user
    curl -s -X DELETE "$SERVER_URL/api/test/users/probe%40test.com" > /dev/null 2>&1 || true

    log_info "Prerequisites check passed"
}

create_test_user() {
    log_info "Creating test user: $TEST_EMAIL"

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$TEST_EMAIL\", \"name\": \"Private Test User\"}" \
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
title: Private E2E Test Project
description: Automated end-to-end test for private projects
---

# Private E2E Test Project

This is a **private** automated test project.

## Secret Content

This content should only be visible to authenticated users.
EOF

    log_info "Test project created with 1 page"
}

deploy_private_project() {
    log_info "Deploying private project..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")

    cd "$TEMP_DIR"

    # First create the project as private via API
    CREATE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"display_name\": \"$TEST_PROJECT\", \"name\": \"$TEST_PROJECT\", \"view_access\": \"authenticated\"}" \
        "$SERVER_URL/api/orgs/$ENCODED_ORG/projects")

    if echo "$CREATE_RESPONSE" | grep -q "error"; then
        log_error "Failed to create private project"
        log_error "Response: $CREATE_RESPONSE"
        exit 1
    fi

    log_info "Created private project: $TEST_PROJECT"

    # Now deploy using the CLI
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

test_unauthenticated_redirect() {
    log_test "Testing unauthenticated access redirects to app domain..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")
    PROJECT_URL="$PAGES_URL/$ENCODED_ORG/$TEST_PROJECT/"

    # Make request without following redirects
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}|%{redirect_url}" "$PROJECT_URL")
    HTTP_CODE=$(echo "$RESPONSE" | cut -d'|' -f1)
    REDIRECT_URL=$(echo "$RESPONSE" | cut -d'|' -f2)

    if [ "$HTTP_CODE" != "302" ]; then
        log_fail "Expected 302 redirect, got HTTP $HTTP_CODE"
        exit 1
    fi

    if [[ "$REDIRECT_URL" != *"/auth/access"* ]]; then
        log_fail "Expected redirect to /auth/access, got: $REDIRECT_URL"
        exit 1
    fi

    log_pass "Unauthenticated access correctly redirects to auth (HTTP 302 -> $REDIRECT_URL)"
}

test_get_signed_url_with_valid_token() {
    log_test "Testing signed URL generation with valid token..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")
    PROJECT_URL="$PAGES_URL/$ENCODED_ORG/$TEST_PROJECT/"

    # URL encode the return parameter using python
    ENCODED_RETURN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PROJECT_URL', safe=''))")
    ACCESS_URL="$SERVER_URL/auth/access?return=$ENCODED_RETURN"

    # Request signed URL with valid API token
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TEST_TOKEN" "$ACCESS_URL")

    if [ "$HTTP_CODE" != "302" ]; then
        log_fail "Expected 302 redirect with signed URL, got HTTP $HTTP_CODE"
        RESPONSE=$(curl -s -H "Authorization: Bearer $TEST_TOKEN" "$ACCESS_URL")
        log_fail "Response: $RESPONSE"
        exit 1
    fi

    # Get the redirect URL (should contain signed token)
    SIGNED_URL=$(curl -s -o /dev/null -w "%{redirect_url}" -H "Authorization: Bearer $TEST_TOKEN" "$ACCESS_URL")

    if [ -z "$SIGNED_URL" ]; then
        log_fail "No redirect URL returned"
        exit 1
    fi

    if [[ "$SIGNED_URL" != *"_s="* ]]; then
        log_fail "Redirect URL does not contain signed token (_s=): $SIGNED_URL"
        exit 1
    fi

    log_pass "Got signed URL: $SIGNED_URL"

    # Store for next test
    VALID_SIGNED_URL="$SIGNED_URL"
}

test_signed_url_grants_access() {
    log_test "Testing signed URL grants access to content..."

    if [ -z "$VALID_SIGNED_URL" ]; then
        log_fail "No signed URL from previous test"
        exit 1
    fi

    # Access the content with the signed URL
    RESPONSE=$(curl -s "$VALID_SIGNED_URL")
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$VALID_SIGNED_URL")

    if [ "$HTTP_CODE" != "200" ]; then
        log_fail "Expected HTTP 200, got HTTP $HTTP_CODE"
        exit 1
    fi

    # Check that the response contains our content
    if [[ "$RESPONSE" != *"Private E2E Test Project"* ]]; then
        log_fail "Response does not contain expected content"
        log_fail "Response: $RESPONSE"
        exit 1
    fi

    log_pass "Signed URL grants access to content (HTTP 200)"
}

test_invalid_token_denied() {
    log_test "Testing invalid token cannot get signed URL..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")
    PROJECT_URL="$PAGES_URL/$ENCODED_ORG/$TEST_PROJECT/"

    ENCODED_RETURN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PROJECT_URL', safe=''))")
    ACCESS_URL="$SERVER_URL/auth/access?return=$ENCODED_RETURN"

    # Request signed URL with invalid token
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer invalid-token-12345" "$ACCESS_URL")

    if [ "$HTTP_CODE" = "302" ]; then
        # Check if it redirects to login instead of the content
        REDIRECT_URL=$(curl -s -o /dev/null -w "%{redirect_url}" -H "Authorization: Bearer invalid-token-12345" "$ACCESS_URL")
        if [[ "$REDIRECT_URL" == *"$PAGES_URL"* ]] && [[ "$REDIRECT_URL" == *"_s="* ]]; then
            log_fail "Invalid token should not get a signed URL"
            exit 1
        fi
        log_pass "Invalid token redirects to login (HTTP 302 -> login)"
    elif [ "$HTTP_CODE" = "401" ]; then
        log_pass "Invalid token denied (HTTP 401)"
    else
        log_fail "Expected HTTP 401 or redirect to login, got HTTP $HTTP_CODE"
        exit 1
    fi
}

test_no_token_denied() {
    log_test "Testing no token cannot get signed URL..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")
    PROJECT_URL="$PAGES_URL/$ENCODED_ORG/$TEST_PROJECT/"

    ENCODED_RETURN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PROJECT_URL', safe=''))")
    ACCESS_URL="$SERVER_URL/auth/access?return=$ENCODED_RETURN"

    # Request signed URL without any token
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$ACCESS_URL")

    if [ "$HTTP_CODE" = "302" ]; then
        # Check if it redirects to login
        REDIRECT_URL=$(curl -s -o /dev/null -w "%{redirect_url}" "$ACCESS_URL")
        if [[ "$REDIRECT_URL" == *"$PAGES_URL"* ]] && [[ "$REDIRECT_URL" == *"_s="* ]]; then
            log_fail "No token should not get a signed URL"
            exit 1
        fi
        log_pass "No token redirects to login (HTTP 302)"
    elif [ "$HTTP_CODE" = "401" ]; then
        log_pass "No token denied (HTTP 401)"
    else
        log_fail "Expected HTTP 401 or redirect to login, got HTTP $HTTP_CODE"
        exit 1
    fi
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}Private Project E2E Test Passed!${NC}"
    echo "========================================="
    echo "Server:  $SERVER_URL"
    echo "Pages:   $PAGES_URL"
    echo "Project: $TEST_PROJECT"
    echo "Org:     $USER_ORG"
    echo ""
    echo "Tests passed:"
    echo "  1. Unauthenticated access redirects to auth"
    echo "  2. Valid token can get signed URL"
    echo "  3. Signed URL grants access to content"
    echo "  4. Invalid token cannot get signed URL"
    echo "  5. No token cannot get signed URL"
    echo ""
}

# Main execution
main() {
    echo "========================================="
    echo "Scratch Cloud Private Project E2E Test"
    echo "========================================="
    echo ""

    check_prerequisites
    create_test_user
    setup_credentials
    create_test_project
    deploy_private_project

    echo ""
    echo "Running access control tests..."
    echo ""

    test_unauthenticated_redirect
    test_get_signed_url_with_valid_token
    test_signed_url_grants_access
    test_invalid_token_denied
    test_no_token_denied

    print_summary
}

main "$@"
