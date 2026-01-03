#!/bin/bash
#
# End-to-end test for account creation and org assignment
#
# Tests:
#   1. Personal account creates org with email.domain format
#   2. Hosted domain account creates org with domain name
#   3. Second hosted domain user joins existing org
#   4. Personal org collision is rejected
#   5. Users can only access their own orgs
#   6. Cleanup test users
#
# Prerequisites:
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-account-org.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="${SCRATCH_SERVER:-http://localhost:8788}"

# Test data - unique emails for this test run
TIMESTAMP=$(date +%s)
PERSONAL_EMAIL="testuser${TIMESTAMP}@gmail.com"
HOSTED_EMAIL1="alice${TIMESTAMP}@testcorp.com"
HOSTED_EMAIL2="bob${TIMESTAMP}@testcorp.com"
HOSTED_DOMAIN="testcorp.com"
COLLISION_EMAIL="collision${TIMESTAMP}@gmail.com"

# Store tokens for cleanup
PERSONAL_TOKEN=""
HOSTED_TOKEN1=""
HOSTED_TOKEN2=""
COLLISION_TOKEN=""

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
    log_info "Cleaning up test users..."

    # Delete test users (ignore errors)
    curl -s -X DELETE "$SERVER_URL/api/test/users/$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PERSONAL_EMAIL'))")" > /dev/null 2>&1 || true
    curl -s -X DELETE "$SERVER_URL/api/test/users/$(python3 -c "import urllib.parse; print(urllib.parse.quote('$HOSTED_EMAIL1'))")" > /dev/null 2>&1 || true
    curl -s -X DELETE "$SERVER_URL/api/test/users/$(python3 -c "import urllib.parse; print(urllib.parse.quote('$HOSTED_EMAIL2'))")" > /dev/null 2>&1 || true
    curl -s -X DELETE "$SERVER_URL/api/test/users/$(python3 -c "import urllib.parse; print(urllib.parse.quote('$COLLISION_EMAIL'))")" > /dev/null 2>&1 || true

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
        log_error "Restart server in development mode"
        exit 1
    fi

    # Clean up probe user if it was created
    curl -s -X DELETE "$SERVER_URL/api/test/users/probe%40gmail.com" > /dev/null 2>&1 || true

    log_info "Prerequisites check passed"
}

test_personal_account_creation() {
    log_test "Testing personal account creation..."

    # Create personal account (no hd = personal Gmail-style account)
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$PERSONAL_EMAIL\", \"name\": \"Test Personal User\"}" \
        "$SERVER_URL/api/test/users")

    # Check for error
    if echo "$RESPONSE" | grep -q '"error"'; then
        log_fail "Failed to create personal account"
        log_fail "Response: $RESPONSE"
        exit 1
    fi

    # Extract token and org name from the "org":{...} object
    PERSONAL_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    ORG_NAME=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    ORG_CREATED=$(echo "$RESPONSE" | grep -o '"created":[^,}]*' | cut -d':' -f2)

    # Expected org name: email with @ replaced by .
    EXPECTED_ORG=$(echo "$PERSONAL_EMAIL" | tr '@' '.' | tr '[:upper:]' '[:lower:]')

    if [ "$ORG_NAME" != "$EXPECTED_ORG" ]; then
        log_fail "Personal org name incorrect"
        log_fail "Expected: $EXPECTED_ORG"
        log_fail "Got: $ORG_NAME"
        exit 1
    fi

    if [ "$ORG_CREATED" != "true" ]; then
        log_fail "Expected org to be newly created"
        exit 1
    fi

    log_pass "Personal account created with org: $ORG_NAME"
}

test_hosted_domain_account_creation() {
    log_test "Testing hosted domain account creation..."

    # Create hosted domain account (with hd = Google Workspace account)
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$HOSTED_EMAIL1\", \"hd\": \"$HOSTED_DOMAIN\", \"name\": \"Alice from TestCorp\"}" \
        "$SERVER_URL/api/test/users")

    # Check for error
    if echo "$RESPONSE" | grep -q '"error"'; then
        log_fail "Failed to create hosted domain account"
        log_fail "Response: $RESPONSE"
        exit 1
    fi

    # Extract token and org name from the "org":{...} object
    HOSTED_TOKEN1=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    ORG_NAME=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    ORG_CREATED=$(echo "$RESPONSE" | grep -o '"created":[^,}]*' | cut -d':' -f2)

    # Expected org name: the hosted domain
    if [ "$ORG_NAME" != "$HOSTED_DOMAIN" ]; then
        log_fail "Hosted domain org name incorrect"
        log_fail "Expected: $HOSTED_DOMAIN"
        log_fail "Got: $ORG_NAME"
        exit 1
    fi

    if [ "$ORG_CREATED" != "true" ]; then
        log_fail "Expected org to be newly created"
        exit 1
    fi

    log_pass "Hosted domain account created with org: $ORG_NAME"
}

test_second_hosted_domain_user_joins_org() {
    log_test "Testing second hosted domain user joins existing org..."

    # Create second user with same hosted domain
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$HOSTED_EMAIL2\", \"hd\": \"$HOSTED_DOMAIN\", \"name\": \"Bob from TestCorp\"}" \
        "$SERVER_URL/api/test/users")

    # Check for error
    if echo "$RESPONSE" | grep -q '"error"'; then
        log_fail "Failed to create second hosted domain account"
        log_fail "Response: $RESPONSE"
        exit 1
    fi

    # Extract token and org info from the "org":{...} object
    HOSTED_TOKEN2=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    ORG_NAME=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    ORG_CREATED=$(echo "$RESPONSE" | grep -o '"created":[^,}]*' | cut -d':' -f2)

    # Should join existing org, not create new one
    if [ "$ORG_NAME" != "$HOSTED_DOMAIN" ]; then
        log_fail "Second user should join same org"
        log_fail "Expected: $HOSTED_DOMAIN"
        log_fail "Got: $ORG_NAME"
        exit 1
    fi

    if [ "$ORG_CREATED" != "false" ]; then
        log_fail "Org should NOT be newly created (user should join existing)"
        exit 1
    fi

    # Verify org has 2 users
    ENCODED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$HOSTED_DOMAIN'))")
    ORG_INFO=$(curl -s "$SERVER_URL/api/test/orgs/$ENCODED_ORG")
    USER_COUNT=$(echo "$ORG_INFO" | grep -o '"user_count":[0-9]*' | cut -d':' -f2)

    if [ "$USER_COUNT" != "2" ]; then
        log_fail "Org should have 2 users, got: $USER_COUNT"
        exit 1
    fi

    log_pass "Second user joined existing org (user_count: $USER_COUNT)"
}

test_personal_org_collision() {
    log_test "Testing duplicate user rejection..."

    # Create a personal account
    COLLISION_ORG=$(echo "$COLLISION_EMAIL" | tr '@' '.' | tr '[:upper:]' '[:lower:]')

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$COLLISION_EMAIL\"}" \
        "$SERVER_URL/api/test/users")

    if echo "$RESPONSE" | grep -q '"error"'; then
        log_fail "Failed to create collision test user"
        log_fail "Response: $RESPONSE"
        exit 1
    fi

    COLLISION_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

    # Try to create the same user again - should fail with 409
    HTTP_CODE=$(curl -s -o /tmp/collision-response.txt -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$COLLISION_EMAIL\"}" \
        "$SERVER_URL/api/test/users")

    if [ "$HTTP_CODE" = "409" ]; then
        log_pass "Duplicate user correctly rejected (HTTP 409)"
    else
        COLLISION_RESPONSE=$(cat /tmp/collision-response.txt)
        log_fail "Expected 409 for duplicate user, got HTTP $HTTP_CODE"
        log_fail "Response: $COLLISION_RESPONSE"
        exit 1
    fi

    log_pass "Duplicate user handling verified"
}

test_org_access_control() {
    log_test "Testing org access control..."

    # Personal user should access their org
    PERSONAL_ORG=$(echo "$PERSONAL_EMAIL" | tr '@' '.' | tr '[:upper:]' '[:lower:]')
    ENCODED_PERSONAL_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PERSONAL_ORG'))")

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $PERSONAL_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_PERSONAL_ORG/projects")

    if [ "$HTTP_CODE" != "200" ]; then
        log_fail "Personal user cannot access own org (HTTP $HTTP_CODE)"
        exit 1
    fi
    log_info "Personal user can access own org"

    # Personal user should NOT access hosted domain org
    ENCODED_HOSTED_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$HOSTED_DOMAIN'))")

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $PERSONAL_TOKEN" \
        "$SERVER_URL/api/orgs/$ENCODED_HOSTED_ORG/projects")

    if [ "$HTTP_CODE" = "200" ]; then
        log_fail "Personal user should NOT access hosted domain org"
        exit 1
    fi
    log_info "Personal user correctly denied access to hosted domain org (HTTP $HTTP_CODE)"

    # Hosted domain user should access their org
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $HOSTED_TOKEN1" \
        "$SERVER_URL/api/orgs/$ENCODED_HOSTED_ORG/projects")

    if [ "$HTTP_CODE" != "200" ]; then
        log_fail "Hosted domain user cannot access own org (HTTP $HTTP_CODE)"
        exit 1
    fi
    log_info "Hosted domain user can access own org"

    # Both hosted domain users should be able to create projects in shared org
    TEST_PROJECT="test-project-${TIMESTAMP}"

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $HOSTED_TOKEN1" \
        -H "Content-Type: application/json" \
        -d "{\"display_name\": \"$TEST_PROJECT\", \"name\": \"$TEST_PROJECT\"}" \
        "$SERVER_URL/api/orgs/$ENCODED_HOSTED_ORG/projects")

    if [ "$HTTP_CODE" != "201" ]; then
        log_fail "First hosted user cannot create project (HTTP $HTTP_CODE)"
        exit 1
    fi
    log_info "First hosted domain user can create projects"

    # Second hosted user should see the project
    PROJECTS_RESPONSE=$(curl -s \
        -H "Authorization: Bearer $HOSTED_TOKEN2" \
        "$SERVER_URL/api/orgs/$ENCODED_HOSTED_ORG/projects")

    if ! echo "$PROJECTS_RESPONSE" | grep -q "$TEST_PROJECT"; then
        log_fail "Second hosted user cannot see project created by first user"
        exit 1
    fi
    log_info "Second hosted domain user can see shared project"

    log_pass "Org access control working correctly"
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}Account & Org Creation E2E Test Passed!${NC}"
    echo "========================================="
    echo "Server: $SERVER_URL"
    echo ""
    echo "Tests passed:"
    echo "  1. Personal account creates org (email.domain format)"
    echo "  2. Hosted domain account creates org (domain name)"
    echo "  3. Second hosted domain user joins existing org"
    echo "  4. Duplicate user rejection"
    echo "  5. Org access control (own org vs other org)"
    echo ""
}

# Main execution
main() {
    echo "========================================="
    echo "Scratch Cloud Account & Org E2E Test"
    echo "========================================="
    echo ""

    check_prerequisites

    echo ""
    echo "Running account/org creation tests..."
    echo ""

    test_personal_account_creation
    test_hosted_domain_account_creation
    test_second_hosted_domain_user_joins_org
    test_personal_org_collision
    test_org_access_control

    print_summary
}

main "$@"
