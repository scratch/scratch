#!/bin/bash
#
# End-to-end test for project description field
#
# Tests:
#   - Creating project with -d description flag
#   - Updating project description
#   - Verifying description in project info and list
#
# Prerequisites:
#   - scratch executable built (bun run build)
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-project-description.sh

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
TEST_EMAIL="desc-test-${TIMESTAMP}@gmail.com"
TEST_PROJECT="desc-project-${TIMESTAMP}"

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

    log_info "Prerequisites check passed"
}

create_test_user() {
    log_info "Creating test user: $TEST_EMAIL"

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$TEST_EMAIL\", \"name\": \"Description Test User\"}" \
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

test_create_with_description() {
    log_info "Testing: Create project with description..."

    OUTPUT=$("$SCRATCH_BIN" cloud projects create "$TEST_PROJECT" \
        -D "My Test Project" \
        -d "This is a test description for the project" \
        2>&1)

    if ! echo "$OUTPUT" | grep -q "Created project: $TEST_PROJECT"; then
        log_error "Failed to create project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    if ! echo "$OUTPUT" | grep -q "Description: This is a test description"; then
        log_error "Description not shown in create output"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Create with description: PASSED"
}

test_project_info_shows_description() {
    log_info "Testing: Project info shows description..."

    OUTPUT=$("$SCRATCH_BIN" cloud projects info "$TEST_PROJECT" 2>&1)

    if ! echo "$OUTPUT" | grep -q "Description: This is a test description"; then
        log_error "Description not shown in info output"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Project info description: PASSED"
}

test_project_list_shows_description() {
    log_info "Testing: Project list shows description..."

    OUTPUT=$("$SCRATCH_BIN" cloud projects list 2>&1)

    if ! echo "$OUTPUT" | grep -q "Description: This is a test description"; then
        log_error "Description not shown in list output"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Project list description: PASSED"
}

test_update_description() {
    log_info "Testing: Update project description..."

    OUTPUT=$("$SCRATCH_BIN" cloud projects update "$TEST_PROJECT" \
        -d "Updated description text" \
        2>&1)

    if ! echo "$OUTPUT" | grep -q "Updated project: $TEST_PROJECT"; then
        log_error "Failed to update project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    if ! echo "$OUTPUT" | grep -q "Description: Updated description text"; then
        log_error "Updated description not shown in output"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Update description: PASSED"
}

test_verify_via_api() {
    log_info "Testing: Verify description via API..."

    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")

    RESPONSE=$(curl -s -H "Authorization: Bearer $TEST_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_ORG/projects/$TEST_PROJECT")

    if ! echo "$RESPONSE" | grep -q '"description":"Updated description text"'; then
        log_error "Description not found in API response"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    log_info "API verification: PASSED"
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}E2E Project Description Test Passed!${NC}"
    echo "========================================="
    echo "Server:  $SERVER_URL"
    echo "Project: $TEST_PROJECT"
    echo "Org:     $USER_ORG"
    echo ""
}

main() {
    echo "========================================="
    echo "Scratch Cloud E2E Project Description Test"
    echo "========================================="
    echo ""

    check_prerequisites
    create_test_user
    setup_credentials
    test_create_with_description
    test_project_info_shows_description
    test_project_list_shows_description
    test_update_description
    test_verify_via_api
    print_summary
}

main "$@"
