#!/bin/bash
#
# End-to-end test for project link command
#
# Tests:
#   - Creating a project then linking to it
#   - Verifying .scratch/project.toml is created with correct content
#
# Prerequisites:
#   - scratch executable built (bun run build)
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-project-link.sh

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
TEST_EMAIL="link-test-${TIMESTAMP}@gmail.com"
TEST_PROJECT="link-project-${TIMESTAMP}"
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

    log_info "Prerequisites check passed"
}

create_test_user() {
    log_info "Creating test user: $TEST_EMAIL"

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$TEST_EMAIL\", \"name\": \"Link Test User\"}" \
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

create_cloud_project() {
    log_info "Creating cloud project: $TEST_PROJECT"

    OUTPUT=$("$SCRATCH_BIN" cloud projects create "$TEST_PROJECT" \
        -D "My Linkable Project" \
        -d "A project to link to" \
        2>&1)

    if ! echo "$OUTPUT" | grep -q "Created project: $TEST_PROJECT"; then
        log_error "Failed to create project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Cloud project created"
}

setup_temp_directory() {
    log_info "Setting up temp directory for link test..."

    TEMP_DIR=$(mktemp -d)
    log_info "Temp directory: $TEMP_DIR"

    # Create a minimal project structure
    mkdir -p "$TEMP_DIR/pages"
    cat > "$TEMP_DIR/pages/index.mdx" << 'EOF'
---
title: Link Test
---

# Link Test Project
EOF

    log_info "Temp directory ready"
}

test_link_command() {
    log_info "Testing: Link project command..."

    cd "$TEMP_DIR"

    OUTPUT=$("$SCRATCH_BIN" cloud projects link "$TEST_PROJECT" 2>&1)

    if ! echo "$OUTPUT" | grep -q "Linked to project: $TEST_PROJECT"; then
        log_error "Link command failed"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    if ! echo "$OUTPUT" | grep -q "Config saved to: .scratch/project.toml"; then
        log_error "Config save message not shown"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Link command: PASSED"
}

test_config_file_created() {
    log_info "Testing: Config file created..."

    CONFIG_FILE="$TEMP_DIR/.scratch/project.toml"

    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Config file not created at $CONFIG_FILE"
        exit 1
    fi

    log_info "Config file exists: PASSED"
}

test_config_file_content() {
    log_info "Testing: Config file content..."

    CONFIG_FILE="$TEMP_DIR/.scratch/project.toml"
    CONFIG_CONTENT=$(cat "$CONFIG_FILE")

    # Check for project name
    if ! echo "$CONFIG_CONTENT" | grep -q "name = \"$TEST_PROJECT\""; then
        log_error "Project name not found in config"
        log_error "Content: $CONFIG_CONTENT"
        exit 1
    fi

    # Check for display name
    if ! echo "$CONFIG_CONTENT" | grep -q 'display_name = "My Linkable Project"'; then
        log_error "Display name not found in config"
        log_error "Content: $CONFIG_CONTENT"
        exit 1
    fi

    # Check for description
    if ! echo "$CONFIG_CONTENT" | grep -q 'description = "A project to link to"'; then
        log_error "Description not found in config"
        log_error "Content: $CONFIG_CONTENT"
        exit 1
    fi

    # Check for view_access
    if ! echo "$CONFIG_CONTENT" | grep -q 'view_access = "public"'; then
        log_error "View access not found in config"
        log_error "Content: $CONFIG_CONTENT"
        exit 1
    fi

    log_info "Config file content: PASSED"
    log_info "Config content:"
    echo "$CONFIG_CONTENT"
}

test_link_nonexistent_project() {
    log_info "Testing: Link to nonexistent project fails..."

    cd "$TEMP_DIR"

    if OUTPUT=$("$SCRATCH_BIN" cloud projects link "nonexistent-project-12345" 2>&1); then
        log_error "Expected link to fail for nonexistent project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    if ! echo "$OUTPUT" | grep -qi "not found\|error"; then
        log_error "Expected error message for nonexistent project"
        log_error "Output: $OUTPUT"
        exit 1
    fi

    log_info "Link nonexistent project fails: PASSED"
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}E2E Project Link Test Passed!${NC}"
    echo "========================================="
    echo "Server:  $SERVER_URL"
    echo "Project: $TEST_PROJECT"
    echo "Org:     $USER_ORG"
    echo ""
}

main() {
    echo "========================================="
    echo "Scratch Cloud E2E Project Link Test"
    echo "========================================="
    echo ""

    check_prerequisites
    create_test_user
    setup_credentials
    create_cloud_project
    setup_temp_directory
    test_link_command
    test_config_file_created
    test_config_file_content
    test_link_nonexistent_project
    print_summary
}

main "$@"
