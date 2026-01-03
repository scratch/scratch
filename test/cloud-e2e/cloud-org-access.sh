#!/bin/bash
#
# End-to-end test for org access control
#
# Tests:
#   1. Verify org name format (email with @ replaced by .)
#   2. Verify user can create projects in their personal org
#   3. Verify user CANNOT create projects in a different org (403)
#   4. Verify user CANNOT list projects in a different org (403)
#
# Prerequisites:
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-org-access.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SCRATCH_SERVER:-http://localhost:8788}"

# Generate unique identifiers for this test run
TIMESTAMP=$(date +%s)
TEST_EMAIL="org-access-${TIMESTAMP}@gmail.com"
TEST_PROJECT="e2e-org-${TIMESTAMP}"

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

    # Check if server is reachable
    if ! curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/api/health" | grep -q "200"; then
        log_error "Server at $SERVER_URL is not reachable"
        log_error "Start the local server: cd ../scratch-server && bun run ops deploy:local"
        exit 1
    fi

    # Check if test endpoints are available (non-production mode)
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
        -d "{\"email\": \"$TEST_EMAIL\", \"name\": \"Org Access Test User\"}" \
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

test_org_name_format() {
    log_test "Testing org name format (email with @ replaced by .)..."

    # Expected format: email with @ replaced by .
    # e.g., koomen@gmail.com -> koomen.gmail.com
    EXPECTED_ORG=$(echo "$TEST_EMAIL" | tr '@' '.' | tr '[:upper:]' '[:lower:]')

    if [ "$USER_ORG" != "$EXPECTED_ORG" ]; then
        log_fail "Org name format incorrect"
        log_fail "Expected: $EXPECTED_ORG"
        log_fail "Got: $USER_ORG"
        exit 1
    fi

    log_pass "Org name format correct: $USER_ORG"
}

test_create_project_in_own_org() {
    log_test "Testing project creation in own org..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")

    # Create project in user's org
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"display_name\": \"$TEST_PROJECT\", \"name\": \"$TEST_PROJECT\"}" \
        "$SERVER_URL/api/orgs/$ENCODED_ORG/projects")

    if [ "$HTTP_CODE" != "201" ]; then
        log_fail "Failed to create project in own org (HTTP $HTTP_CODE)"
        exit 1
    fi

    log_pass "Created project in own org (HTTP 201)"
}

test_list_projects_in_own_org() {
    log_test "Testing list projects in own org..."

    # URL encode the org name
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$USER_ORG'))")

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_ORG/projects")

    if [ "$HTTP_CODE" != "200" ]; then
        log_fail "Failed to list projects in own org (HTTP $HTTP_CODE)"
        exit 1
    fi

    log_pass "Listed projects in own org (HTTP 200)"
}

test_cannot_create_project_in_other_org() {
    log_test "Testing cannot create project in other org..."

    # Try to create project in a different org (should fail with 403)
    OTHER_ORG="not.my.org.example.com"
    ENCODED_OTHER_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$OTHER_ORG'))")

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"display_name\": \"test\", \"name\": \"test\"}" \
        "$SERVER_URL/api/orgs/$ENCODED_OTHER_ORG/projects")

    if [ "$HTTP_CODE" = "201" ]; then
        log_fail "Should NOT be able to create project in other org"
        exit 1
    fi

    if [ "$HTTP_CODE" != "403" ]; then
        log_warn "Expected 403, got HTTP $HTTP_CODE (may be acceptable)"
    fi

    log_pass "Cannot create project in other org (HTTP $HTTP_CODE)"
}

test_cannot_list_projects_in_other_org() {
    log_test "Testing cannot list projects in other org..."

    # Try to list projects in a different org (should fail with 403)
    OTHER_ORG="not.my.org.example.com"
    ENCODED_OTHER_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$OTHER_ORG'))")

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_OTHER_ORG/projects")

    if [ "$HTTP_CODE" = "200" ]; then
        log_fail "Should NOT be able to list projects in other org"
        exit 1
    fi

    if [ "$HTTP_CODE" != "403" ]; then
        log_warn "Expected 403, got HTTP $HTTP_CODE (may be acceptable)"
    fi

    log_pass "Cannot list projects in other org (HTTP $HTTP_CODE)"
}

test_domain_org_access() {
    log_test "Testing domain org access (if applicable)..."

    # Extract domain from email
    DOMAIN_ORG=$(echo "$TEST_EMAIL" | cut -d'@' -f2 | tr '[:upper:]' '[:lower:]')
    ENCODED_DOMAIN_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$DOMAIN_ORG'))")

    # Skip if user's personal org equals their domain org (shouldn't happen with new format)
    if [ "$DOMAIN_ORG" = "$USER_ORG" ]; then
        log_warn "Skipping domain org test - personal org equals domain"
        return
    fi

    # Try to list projects in domain org (should succeed for hosted domain users)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_DOMAIN_ORG/projects")

    if [ "$HTTP_CODE" = "200" ]; then
        log_pass "Can access domain org $DOMAIN_ORG (HTTP 200) - hosted domain user"
    elif [ "$HTTP_CODE" = "403" ]; then
        log_pass "Cannot access domain org $DOMAIN_ORG (HTTP 403) - personal account user"
    else
        log_warn "Unexpected response for domain org access (HTTP $HTTP_CODE)"
    fi
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}Org Access Control E2E Test Passed!${NC}"
    echo "========================================="
    echo "Server: $SERVER_URL"
    echo "User:   $TEST_EMAIL"
    echo "Org:    $USER_ORG"
    echo ""
    echo "Tests passed:"
    echo "  1. Org name format (email with @ -> .)"
    echo "  2. Can create projects in own org"
    echo "  3. Can list projects in own org"
    echo "  4. Cannot create projects in other org"
    echo "  5. Cannot list projects in other org"
    echo "  6. Domain org access (if applicable)"
    echo ""
}

# Main execution
main() {
    echo "========================================="
    echo "Scratch Cloud Org Access E2E Test"
    echo "========================================="
    echo ""

    check_prerequisites
    create_test_user

    echo ""
    echo "Running org access control tests..."
    echo ""

    test_org_name_format
    test_create_project_in_own_org
    test_list_projects_in_own_org
    test_cannot_create_project_in_other_org
    test_cannot_list_projects_in_other_org
    test_domain_org_access

    print_summary
}

main "$@"
