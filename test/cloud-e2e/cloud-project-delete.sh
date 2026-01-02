#!/bin/bash
#
# End-to-end test for project delete command
#
# Tests:
#   - Deleting a project with --force flag
#   - Verifying deleted project is no longer accessible
#   - Verifying delete without --force requires confirmation (we test with --force only)
#
# Prerequisites:
#   - scratch executable built (bun run build)
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-project-delete.sh

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

# Generate unique identifiers for this test run
TIMESTAMP=$(date +%s)
TEST_EMAIL="delete-test-${TIMESTAMP}@testmail.com"
TEST_PROJECT="delete-project-${TIMESTAMP}"

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

    # Delete test user (will cascade delete any remaining projects)
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

    log_info "Prerequisites check passed"
}

create_test_user() {
    log_info "Creating test user: $TEST_EMAIL"

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$TEST_EMAIL\", \"name\": \"Delete Test User\"}" \
        "$SERVER_URL/api/test/users")

    if echo "$RESPONSE" | grep -q '"error"'; then
        log_error "Failed to create test user"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    TEST_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    USER_ORG=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$TEST_TOKEN" ]; then
        log_error "No token returned"
        exit 1
    fi

    log_info "Test user created (org: $USER_ORG)"
}

setup_credentials() {
    log_info "Setting up credentials..."

    CREDS_DIR="$HOME/.scratch"
    mkdir -p "$CREDS_DIR"

    USER_RESPONSE=$(curl -s -H "Authorization: Bearer $TEST_TOKEN" "$SERVER_URL/api/me")

    USER_ID=$(echo "$USER_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    USER_EMAIL=$(echo "$USER_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    USER_NAME=$(echo "$USER_RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "")

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

    cat > "$CREDS_DIR/config.toml" << EOF
serverUrl = "$SERVER_URL"
EOF

    log_info "Credentials configured"
}

create_project_for_deletion() {
    log_info "Creating project to delete: $TEST_PROJECT"

    OUTPUT=$("$SCRATCH_BIN" cloud projects create "$TEST_PROJECT" \
        -D "Project to Delete" \
        -d "This project will be deleted" \
        2>&1)

    if ! echo "$OUTPUT" | grep -q "Created project: $TEST_PROJECT"; then
        log_error "Failed to create project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Project created for deletion test"
}

test_project_exists_before_delete() {
    log_info "Testing: Project exists before deletion..."

    OUTPUT=$("$SCRATCH_BIN" cloud projects info "$TEST_PROJECT" 2>&1)

    if ! echo "$OUTPUT" | grep -q "Project: $TEST_PROJECT"; then
        log_error "Project not found before deletion"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Project exists before delete: PASSED"
}

test_delete_with_force() {
    log_info "Testing: Delete project with --force..."

    OUTPUT=$("$SCRATCH_BIN" cloud projects delete "$TEST_PROJECT" --force 2>&1)

    if ! echo "$OUTPUT" | grep -q "Deleted project: $TEST_PROJECT"; then
        log_error "Delete command failed"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Delete with force: PASSED"
}

test_project_not_found_after_delete() {
    log_info "Testing: Project not found after deletion..."

    if OUTPUT=$("$SCRATCH_BIN" cloud projects info "$TEST_PROJECT" 2>&1); then
        log_error "Expected project info to fail after deletion"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    if ! echo "$OUTPUT" | grep -qi "not found\|error"; then
        log_error "Expected 'not found' error"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Project not found after delete: PASSED"
}

test_project_not_in_list() {
    log_info "Testing: Deleted project not in list..."

    OUTPUT=$("$SCRATCH_BIN" cloud projects list 2>&1)

    if echo "$OUTPUT" | grep -q "$TEST_PROJECT"; then
        log_error "Deleted project still appears in list"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Project not in list: PASSED"
}

test_delete_via_api() {
    log_info "Testing: Verify deletion via API..."

    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_ORG/projects/$TEST_PROJECT")

    if [ "$HTTP_CODE" != "404" ]; then
        log_error "Expected 404 from API, got $HTTP_CODE"
        exit 1
    fi

    log_info "API returns 404 for deleted project: PASSED"
}

test_delete_nonexistent_project() {
    log_info "Testing: Delete nonexistent project fails..."

    if OUTPUT=$("$SCRATCH_BIN" cloud projects delete "nonexistent-project-12345" --force 2>&1); then
        log_error "Expected delete to fail for nonexistent project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    if ! echo "$OUTPUT" | grep -qi "not found\|error"; then
        log_error "Expected error message for nonexistent project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Delete nonexistent project fails: PASSED"
}

test_rm_alias() {
    log_info "Testing: 'rm' alias works..."

    # Create another project to delete with rm alias
    ALIAS_PROJECT="rm-alias-${TIMESTAMP}"

    "$SCRATCH_BIN" cloud projects create "$ALIAS_PROJECT" -D "Alias Test" > /dev/null 2>&1

    OUTPUT=$("$SCRATCH_BIN" cloud projects rm "$ALIAS_PROJECT" --force 2>&1)

    if ! echo "$OUTPUT" | grep -q "Deleted project: $ALIAS_PROJECT"; then
        log_error "rm alias failed"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "rm alias: PASSED"
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}E2E Project Delete Test Passed!${NC}"
    echo "========================================="
    echo "Server:  $SERVER_URL"
    echo "Project: $TEST_PROJECT"
    echo "Org:     $USER_ORG"
    echo ""
}

main() {
    echo "========================================="
    echo "Scratch Cloud E2E Project Delete Test"
    echo "========================================="
    echo ""

    check_prerequisites
    create_test_user
    setup_credentials
    create_project_for_deletion
    test_project_exists_before_delete
    test_delete_with_force
    test_project_not_found_after_delete
    test_project_not_in_list
    test_delete_via_api
    test_delete_nonexistent_project
    test_rm_alias
    print_summary
}

main "$@"
