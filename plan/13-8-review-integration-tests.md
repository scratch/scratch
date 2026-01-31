# Block 8 Review: Integration Tests

**Reviewer:** Claude Opus 4.5
**Date:** 2026-01-31
**Risk Level:** Medium (Test infrastructure)

## 1. Summary

This block significantly expands integration test coverage across three main areas:

1. **Main integration test suite** (`ops/commands/server/test.ts`) - A comprehensive end-to-end test that deploys the full stack and verifies:
   - Static file serving with MIME types
   - .mdx to .md redirect behavior
   - Project enumeration prevention
   - Content token URL cleanup
   - API token authentication
   - Project ID persistence
   - WWW domain serving

2. **CLI e2e tests** (`cli/test/e2e/static-assets.test.ts`, `cli/test/e2e/static-conflicts.test.ts`) - Build-time tests for static asset handling and conflict detection

3. **Config and validation tests** (`ops/test/config.test.ts`, `server/test/validate-env.test.ts`) - Unit tests for configuration parsing and environment validation

The tests are well-structured and provide good coverage for security-critical paths. However, there are some potential reliability concerns and minor issues worth addressing.

## 2. Files Reviewed

| File | Purpose | Lines |
|------|---------|-------|
| `ops/commands/server/test.ts` | Main integration test suite | 1093 |
| `ops/commands/server/setup.ts` | Setup flow with conditional auth prompts | 409 |
| `ops/lib/config.ts` | Config parsing and validation utilities | 331 |
| `ops/test/config.test.ts` | Unit tests for auth-mode-aware validation | 191 |
| `cli/test/e2e/static-assets.test.ts` | E2E tests for static file copying | 226 |
| `cli/test/e2e/static-conflicts.test.ts` | E2E tests for conflict detection | 260 |
| `server/test/validate-env.test.ts` | Unit tests for runtime env validation | 147 |
| `ops/lib/process.ts` | Process spawning utilities (supporting file) | 63 |
| `cli/test/e2e/util.ts` | CLI test utilities (supporting file) | 48 |
| `server/src/lib/validate-env.ts` | Runtime env validation (supporting file) | 47 |

**Total lines reviewed:** ~2,815

## 3. Answers to Review Questions

### Q1: Do the tests run reliably (no flaky tests)?

**Assessment: Generally reliable, but some timing concerns**

**Positive indicators:**
- Fixed delays (`await new Promise(resolve => setTimeout(resolve, 2000))`) after deployment to allow propagation
- Cache-busting query parameters for WWW domain tests
- Proper cleanup in `finally` blocks
- SIGINT handler for graceful interrupt handling

**Potential flakiness sources:**
1. **Lines 173, 873, 979** - Fixed 2000ms/5000ms delays may be insufficient on slow networks
2. **Line 227** - The `.mdx` redirect test checks for redirect to `.md` but the URL could vary based on routing
3. **Lines 376-380** - Content access endpoint test could fail if auth takes longer than expected
4. **Lines 884-889** - Old URL check has a "may be cached" fallback, indicating non-deterministic behavior

**Evidence:**
```typescript
// ops/commands/server/test.ts:173
await new Promise(resolve => setTimeout(resolve, 2000))

// ops/commands/server/test.ts:884-889
const oldUrlResponse = await fetch(deployedUrl)
if (oldUrlResponse.ok) {
  console.log(`${yellow}!${reset} Old URL still works (may be cached or stale)\n`)
} else {
  console.log(`${green}✓${reset} Old URL no longer works (project was renamed)\n`)
}
```

### Q2: Is there adequate coverage for security-critical paths?

**Assessment: Good coverage, with some gaps**

**Well-covered paths:**
1. **Project enumeration prevention** (lines 261-306) - Tests that non-existent projects redirect to auth, not 404
2. **API token authentication** (lines 684-814) - Tests create, list, use, revoke, and rejection of invalid tokens
3. **Content token isolation** (lines 797-812) - Tests that API tokens don't work on content domain
4. **Content token URL cleanup** (lines 309-535) - Tests token-to-cookie conversion and clean redirect

**Coverage gaps:**
1. No test for expired API tokens
2. No test for API token max expiration enforcement (365 days server-side)
3. No direct test for CORS policy on API endpoints
4. No test for share token expiration

**Evidence of good security testing:**
```typescript
// ops/commands/server/test.ts:797-812 - Security invariant test
// Test 7: API token must NOT work on content domain (security invariant)
const privateContentUrl = `https://${pagesDomain}/test-user/private-project-that-does-not-exist/`
const privateContentResponse = await fetch(privateContentUrl, {
  headers: { 'X-Api-Key': apiToken },
  redirect: 'manual',
})
if (privateContentResponse.status === 200) {
  console.error(`${red}✗${reset} API token granted access on content domain (SECURITY ISSUE)`)
  testPassed = false
}
```

### Q3: Are API token tests testing the right things?

**Assessment: Yes, the tests cover the important scenarios**

**Tested scenarios:**
1. Token creation with expiry (line 691)
2. Token appears in list (line 709)
3. Authentication via X-Api-Key header (line 717)
4. Deploy with SCRATCH_TOKEN env var (lines 729-751)
5. Token revocation (lines 761-769)
6. Revoked token rejection (lines 771-783)
7. Invalid token rejection (lines 785-794)
8. API token doesn't work on content domain (lines 797-812)

**What's correctly tested:**
```typescript
// ops/commands/server/test.ts:717-726 - API authentication
const apiResponse = await fetch(`${serverUrl}/api/me`, {
  headers: { 'X-Api-Key': apiToken },
})
if (!apiResponse.ok) {
  console.error(`${red}✗${reset} API token authentication failed: ${apiResponse.status}`)
  testPassed = false
} else {
  const apiUser = await apiResponse.json() as { user: { email: string } }
  console.log(`${green}✓${reset} API token authenticated as ${apiUser.user.email}`)
}
```

## 4. Code Quality Assessment

### Simplicity
**Rating: Good**

The test structure is straightforward - sequential steps with clear logging. However, the main integration test file (1093 lines) is quite long. Some refactoring into helper functions could improve maintainability.

### Clarity
**Rating: Excellent**

- Clear step numbering (Step 1, Step 2, etc.)
- Descriptive console output with color-coded status
- Comments explain the purpose of each test section
- Security tests include explanatory comments about what they're testing and why

**Example of good clarity:**
```typescript
// ops/commands/server/test.ts:261-264
// Step 8c: Test project enumeration prevention
// Non-existent projects should redirect to auth, not return 404 immediately
// This prevents attackers from distinguishing "doesn't exist" from "private"
```

### Correctness
**Rating: Good with minor issues**

**Correct behaviors:**
- Tests properly use `redirect: 'manual'` when checking redirect responses
- Proper cleanup in finally blocks
- Cookie parsing handles the format correctly

**Minor issues:**
1. **Line 647-650** - Share cookie parsing has a subtle bug potential:
```typescript
const shareCookieMatch = shareSetCookie.match(/(_share_[^=]+=)([^;]+)/)
if (shareCookieMatch) {
  const shareCookieName = shareCookieMatch[1].slice(0, -1) // Remove trailing =
```
The regex captures the `=` in group 1, then it's manually removed. This works but is fragile.

2. **Line 910** - Error checking looks for "Project not found" in both stdout and stderr:
```typescript
} else if (invalidIdResult.stderr.includes('Project not found') || invalidIdResult.stdout.includes('Project not found')) {
```
This is correct but could miss other error formats.

### Consistency
**Rating: Excellent**

- Consistent use of color codes for status output
- Consistent error handling patterns
- CLI E2E tests all follow the same pattern: create project, modify, build, check results, cleanup
- Config tests follow standard Bun test patterns with beforeEach/afterEach

### Security
**Rating: Excellent**

The tests themselves don't introduce security issues. They:
- Use proper cleanup for temporary files and test projects
- Don't log sensitive tokens (shows only first 12 chars)
- Test security-critical paths appropriately

## 5. Issues Found

### Critical Issues
None found.

### Major Issues

**M1: Potential false positive in content domain API token test (ops/commands/server/test.ts:801-812)**

The test uses a non-existent project path to verify API tokens don't work on the content domain. However, the test passes if the response is anything other than 200, including 404 for the non-existent path. A more robust test would use an actual public project and verify the API token provides no additional access.

```typescript
// Current test - could pass for wrong reasons
const privateContentUrl = `https://${pagesDomain}/test-user/private-project-that-does-not-exist/`
const privateContentResponse = await fetch(privateContentUrl, {
  headers: { 'X-Api-Key': apiToken },
  redirect: 'manual',
})
if (privateContentResponse.status === 200) {
  // FAIL
}
```

**Recommendation:** Test against the actual deployed public project with and without the API token to verify behavior is identical.

### Minor Issues

**m1: CLI E2E tests have long timeouts (120 seconds each)**

All CLI E2E tests have 120-second timeouts. While this prevents flaky failures, it also means test failures are slow to surface.

```typescript
// cli/test/e2e/static-assets.test.ts:20
}, 120_000);
```

**m2: Share token test depends on ALLOW_SHARE_TOKENS feature flag (ops/commands/server/test.ts:541-542)**

The share token URL cleanup test is skipped if share tokens are disabled. This is appropriate for conditional testing, but means coverage depends on instance configuration.

**m3: Integration test doesn't verify the revoked API token returns exactly 401**

```typescript
// ops/commands/server/test.ts:775-783
if (revokedResponse.ok) {
  // FAIL
} else if (revokedResponse.status === 401) {
  // PASS
} else {
  // FAIL - but the message says "Unexpected status"
}
```

This is correct but could be simplified to just check for 401.

**m4: Duplicate credential reading logic (ops/commands/server/test.ts:352-365, 456-468)**

The credential file reading for getting the CLI token is duplicated. Should be extracted to a helper function.

### Suggestions

**S1: Add exponential backoff for deployment propagation**

Instead of fixed delays, implement retry logic with exponential backoff for more reliable testing:

```typescript
async function waitForDeployment(url: string, maxAttempts = 5): Promise<Response> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(url)
    if (response.ok) return response
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
  }
  throw new Error(`Deployment not ready after ${maxAttempts} attempts`)
}
```

**S2: Extract test helpers into a shared module**

The main integration test could benefit from extracting common operations:
- `getCliToken(appDomain)` - Read CLI credentials
- `createTestProject(name, visibility)` - Create and deploy a project
- `cleanupTestProject(name)` - Delete project and temp files

## 6. Recommendations

### Required Before Launch

1. **Fix the API token content domain test (M1)** - Strengthen the test to use an actual project rather than a non-existent path. This ensures the security invariant is properly verified.

### Nice-to-Have

1. Extract duplicate credential reading logic into a helper function
2. Add a test for expired API tokens
3. Add a test for the 365-day max expiration enforcement
4. Consider splitting the main integration test into smaller, focused test files

### Future Considerations

1. Add retry logic with exponential backoff for network-dependent tests
2. Consider adding a "quick" test mode that skips WWW domain testing
3. Add performance benchmarks to track test execution time
4. Consider parallel test execution for CLI E2E tests

## 7. Conclusion

The integration test suite in Block 8 provides **solid coverage** for the critical paths introduced in the launch-bf branch. The tests are well-structured, clearly documented, and follow good testing practices.

**Strengths:**
- Comprehensive coverage of security-critical paths (enumeration prevention, API tokens, content token isolation)
- Clear step-by-step logging that aids debugging
- Good cleanup handling
- Auth-mode-aware validation tests are thorough

**Areas for Improvement:**
- The content domain API token test should be strengthened
- Some timing-dependent tests could be made more robust
- The main integration test file could be modularized

**Overall Assessment:** The test infrastructure is production-ready. The one major issue (M1) should be addressed before launch to ensure the security invariant test is robust, but it's not a blocker since the actual security implementation is likely correct - only the test coverage is incomplete.

**Recommendation:** Approve for launch with the M1 fix applied.
