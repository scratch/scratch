#!/bin/bash
#
# End-to-end test for org assignment rules
#
# Tests:
#   - Gmail users get personal orgs (pete@gmail.com → pete.gmail.com)
#   - Google Workspace users get domain orgs (pete@ycombinator.com with hd → ycombinator.com)
#   - Personal accounts with custom domains are rejected (pete@custom.com without hd → error)
#
# Prerequisites:
#   - Local server running (bun run ops deploy:local in scratch-server)
#
# Usage:
#   ./test/cloud-e2e/cloud-org-assignment.sh

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

# Test emails
GMAIL_EMAIL="orgtest-${TIMESTAMP}@gmail.com"
WORKSPACE_EMAIL="orgtest-${TIMESTAMP}@ycombinator.com"
CUSTOM_DOMAIN_EMAIL="orgtest-${TIMESTAMP}@customdomain.com"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    log_info "Cleaning up..."

    # Delete test users
    for email in "$GMAIL_EMAIL" "$WORKSPACE_EMAIL" "$CUSTOM_DOMAIN_EMAIL"; do
        ENCODED_EMAIL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$email'))")
        curl -s -X DELETE "$SERVER_URL/api/test/users/$ENCODED_EMAIL" > /dev/null 2>&1 || true
    done

    log_info "Cleanup complete"
}

trap cleanup EXIT

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if server is reachable
    if ! curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/api/health" | grep -q "200"; then
        log_error "Server at $SERVER_URL is not reachable"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

test_gmail_gets_personal_org() {
    log_info "Testing: Gmail user gets personal org..."

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$GMAIL_EMAIL\", \"name\": \"Gmail Test User\"}" \
        "$SERVER_URL/api/test/users")

    if echo "$RESPONSE" | grep -q '"error"'; then
        log_error "Failed to create Gmail user"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    # Extract org name
    ORG_NAME=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    EXPECTED_ORG="orgtest-${TIMESTAMP}.gmail.com"

    if [ "$ORG_NAME" != "$EXPECTED_ORG" ]; then
        log_error "Gmail user got wrong org"
        log_error "Expected: $EXPECTED_ORG"
        log_error "Got: $ORG_NAME"
        exit 1
    fi

    log_info "Gmail user org: $ORG_NAME (correct)"
    log_info "Gmail personal org: PASSED"
}

test_workspace_gets_domain_org() {
    log_info "Testing: Google Workspace user gets domain org..."

    # Note: hd parameter simulates Google Workspace account
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$WORKSPACE_EMAIL\", \"name\": \"Workspace Test User\", \"hd\": \"ycombinator.com\"}" \
        "$SERVER_URL/api/test/users")

    if echo "$RESPONSE" | grep -q '"error"'; then
        log_error "Failed to create Workspace user"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    # Extract org name
    ORG_NAME=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    EXPECTED_ORG="ycombinator.com"

    if [ "$ORG_NAME" != "$EXPECTED_ORG" ]; then
        log_error "Workspace user got wrong org"
        log_error "Expected: $EXPECTED_ORG"
        log_error "Got: $ORG_NAME"
        exit 1
    fi

    log_info "Workspace user org: $ORG_NAME (correct)"
    log_info "Workspace domain org: PASSED"
}

test_custom_domain_rejected() {
    log_info "Testing: Personal account with custom domain is rejected..."

    # This should fail - personal Google account with custom domain (no hd)
    HTTP_CODE=$(curl -s -o /tmp/custom-domain-response.txt -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$CUSTOM_DOMAIN_EMAIL\", \"name\": \"Custom Domain User\"}" \
        "$SERVER_URL/api/test/users")

    RESPONSE=$(cat /tmp/custom-domain-response.txt)

    if [ "$HTTP_CODE" != "403" ]; then
        log_error "Expected 403 for custom domain user, got $HTTP_CODE"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    if ! echo "$RESPONSE" | grep -q "not supported"; then
        log_error "Expected rejection message for custom domain"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    log_info "Custom domain correctly rejected with 403"
    log_info "Custom domain rejection: PASSED"
}

test_workspace_users_share_org() {
    log_info "Testing: Multiple Workspace users share same domain org..."

    # Create second user in same workspace
    SECOND_EMAIL="orgtest2-${TIMESTAMP}@ycombinator.com"

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$SECOND_EMAIL\", \"name\": \"Second Workspace User\", \"hd\": \"ycombinator.com\"}" \
        "$SERVER_URL/api/test/users")

    if echo "$RESPONSE" | grep -q '"error"'; then
        log_error "Failed to create second Workspace user"
        log_error "Response: $RESPONSE"
        exit 1
    fi

    # Extract org info
    ORG_NAME=$(echo "$RESPONSE" | grep -o '"org":{[^}]*}' | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    ORG_CREATED=$(echo "$RESPONSE" | grep -o '"created":[^,}]*' | cut -d':' -f2)

    if [ "$ORG_NAME" != "ycombinator.com" ]; then
        log_error "Second user got wrong org: $ORG_NAME"
        exit 1
    fi

    if [ "$ORG_CREATED" != "false" ]; then
        log_error "Expected org to already exist (created: false), got: $ORG_CREATED"
        exit 1
    fi

    # Cleanup second user
    ENCODED_EMAIL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SECOND_EMAIL'))")
    curl -s -X DELETE "$SERVER_URL/api/test/users/$ENCODED_EMAIL" > /dev/null 2>&1 || true

    log_info "Second Workspace user joined existing org (created: false)"
    log_info "Shared domain org: PASSED"
}

print_summary() {
    echo ""
    echo "========================================="
    echo -e "${GREEN}E2E Org Assignment Test Passed!${NC}"
    echo "========================================="
    echo "Server: $SERVER_URL"
    echo ""
    echo "Verified:"
    echo "  - Gmail users get personal orgs"
    echo "  - Workspace users get domain orgs"
    echo "  - Custom domain personal accounts rejected"
    echo "  - Multiple Workspace users share domain org"
    echo ""
}

main() {
    echo "========================================="
    echo "Scratch Cloud E2E Org Assignment Test"
    echo "========================================="
    echo ""

    check_prerequisites
    test_gmail_gets_personal_org
    test_workspace_gets_domain_org
    test_custom_domain_rejected
    test_workspace_users_share_org
    print_summary
}

main "$@"
