# Review: Block 1 - API Tokens & Authentication

**Review Date:** 2026-01-31
**Risk Level:** High (Security-critical authentication code)

## Summary

This block adds API token support for CI/CD and automation workflows. Users can create persistent tokens that authenticate via `X-Api-Key` header, distinct from session-based OAuth tokens that use `Authorization: Bearer`.

## Files Reviewed

| File | Purpose | Lines |
|------|---------|-------|
| `server/src/auth.ts` | BetterAuth apiKey plugin config | 207 |
| `server/src/db/migrations/002_add_api_key_table.sql` | Database schema | 31 |
| `server/src/lib/api-helpers.ts` | Authentication flow | 158 |
| `cli/src/cmd/cloud/tokens.ts` | CLI token commands | 251 |
| `cli/src/cloud/request.ts` | Header building logic | 272 |
| `cli/src/config/types.ts` | Credential types | 81 |
| `cli/src/config/credentials.ts` | Token storage | 108 |
| `cli/src/cmd/cloud/auth.ts` | Auth commands (for context) | 309 |
| `cli/src/index.ts` | Command registration | 587 |
| `server/src/routes/pages.ts` | Content domain (verify no API key handling) | 161 |
| `ops/commands/server/test.ts` | Integration tests | 871 |

## Answers to Review Questions

### 1. Can an API token be used to access the content domain?

**NO** - This security invariant is properly enforced.

The content domain (`pages.ts`) only handles authentication via:
- Content tokens (project-scoped JWTs) in cookies or `_ctoken` param
- Share tokens in `token` param

There is no code in `pages.ts` that checks for `X-Api-Key` header. This is intentional - the content domain serves user-uploaded JavaScript that could be malicious. If API tokens worked there, an attacker could steal a user's API key via malicious JS.

The integration test explicitly verifies this (`ops/commands/server/test.ts:574-590`):
```typescript
// Test 7: API token must NOT work on content domain (security invariant)
const privateContentResponse = await fetch(privateContentUrl, {
  headers: { 'X-Api-Key': apiToken },
  redirect: 'manual',
})
if (privateContentResponse.status === 200) {
  console.error('API token granted access on content domain (SECURITY ISSUE)')
  testPassed = false
}
```

### 2. What happens if both SCRATCH_TOKEN env var and stored credentials exist?

**SCRATCH_TOKEN takes priority.**

In `cli/src/cloud/request.ts:136-141`:
```typescript
// Check environment variable first (always treated as API key)
const envToken = getEnvToken()
if (envToken) {
  headers['X-Api-Key'] = envToken
  return { headers, hasCfAccess: cfHeaders !== undefined }
}
```

The function returns immediately if `SCRATCH_TOKEN` is set, without loading stored credentials. This is documented in the CLAUDE.md and is the correct behavior for CI/CD scenarios.

### 3. Are API tokens properly hashed before storage?

**YES** - BetterAuth's apiKey plugin handles this automatically.

Evidence:
1. The `apikey` table has a `key` column (hashed) and `start` column (first few chars for display)
2. The full token is only returned in `ApiKeyCreateResponse` on creation
3. `ApiKeyListResponse` includes `start` but not `key`
4. The CLI explicitly warns: "Copy this token now. It will not be shown again."

### 4. Is the max expiration (365 days) enforced server-side?

**YES** - Enforced in `server/src/auth.ts:87`:
```typescript
keyExpiration: {
  defaultExpiresIn: null,           // No default expiration
  maxExpiresIn: 365 * 24 * 60 * 60, // 365 days maximum (in seconds)
}
```

BetterAuth validates this on the server. If a client requests a longer expiration, BetterAuth rejects it.

## Security Analysis

| Check | Status | Notes |
|-------|--------|-------|
| Tokens hashed in database | ✅ | BetterAuth handles hashing |
| Only shown once on creation | ✅ | Full key only in create response |
| Not valid on content domain | ✅ | pages.ts has no X-Api-Key handling |
| X-Api-Key header (not Bearer) | ✅ | Distinguishes from session tokens |
| Max expiration enforced server-side | ✅ | 365 days max |
| Invalid token doesn't fall through | ✅ | Returns null in api-helpers.ts:100-102 |
| CF Access compatibility | ✅ | Both header sets can coexist |
| Token validation on create | ✅ | Name: 3-40 chars, alphanumeric/hyphens/underscores |

## Authentication Flow

The authentication order in `getAuthenticatedUser()` is:

1. **Bearer token** - Manual session lookup (for device auth tokens)
2. **X-Api-Key header** - BetterAuth apiKey plugin
3. **CF Access JWT** - Only if AUTH_MODE=cloudflare-access
4. **Session cookies** - Standard browser auth

This ordering is correct because:
- Bearer tokens need manual handling (BetterAuth bug workaround)
- API key returns null if invalid (doesn't fall through)
- CF Access is checked before cookies when enabled

## Code Quality Assessment

### Simplicity ✅
The implementation leverages BetterAuth's apiKey plugin rather than building custom token logic. This reduces code and security risk.

### Clarity ✅
- Clear separation between token types (session vs api_key)
- Good documentation comments explaining header choices
- Token commands have helpful usage hints after creation

### Correctness ✅
- All token CRUD operations work correctly
- Token validation prevents edge cases (length, characters)
- Revoked tokens are properly rejected

### Consistency ✅
- Follows existing patterns (CloudContext, request utility)
- Uses snake_case for database fields where possible
- Unix-style command names (ls, rm)

### Security ✅
- All identified invariants are enforced
- Integration tests verify security-critical paths

## Issues Found

### Minor Issues

1. **Token name uniqueness not enforced**
   - Users can create multiple tokens with the same name
   - `tokens revoke <name>` would revoke the first match
   - **Recommendation:** Either enforce uniqueness or require ID for revocation
   - **Severity:** Low - mostly a UX issue

2. **Client-side expiration validation missing**
   - CLI accepts any `--expires` value, server rejects if >365
   - **Recommendation:** Add client-side validation: `if (expires > 365) throw new Error(...)`
   - **Severity:** Low - server enforces the limit

3. **No token last-used tracking**
   - The schema has `lastRequest` column but it's not shown in CLI
   - **Recommendation:** Consider showing "Last used: X days ago" in `tokens ls`
   - **Severity:** Low - nice-to-have for token hygiene

### Observations (Not Issues)

1. **BetterAuth camelCase columns** - The apikey table uses BetterAuth's default camelCase instead of project's snake_case convention. This is documented and intentional (plugin doesn't support field mapping like deviceAuthorization does).

2. **Type field backwards compatibility** - Old credentials default to `type: 'session'`. This is handled correctly in the code.

## Test Coverage

The integration tests (`ops/commands/server/test.ts:462-592`) cover:

| Test | Description | Status |
|------|-------------|--------|
| Create token | With expiration | ✅ |
| List tokens | Shows new token | ✅ |
| X-Api-Key auth | Direct API call | ✅ |
| SCRATCH_TOKEN env | Deploy with env var | ✅ |
| Revoke token | Delete by name | ✅ |
| Revoked rejection | 401 on revoked token | ✅ |
| Invalid rejection | 401 on invalid token | ✅ |
| Content domain | API key ignored | ✅ |

## Recommendations

### Required Before Launch
None - the implementation is secure and functional.

### Nice-to-Have
1. Add client-side expiration validation
2. Show last-used time in `tokens ls`
3. Consider token name uniqueness constraint

### Future Considerations
1. Token scopes (read-only vs read-write)
2. Per-project tokens (vs user-level)
3. Token refresh mechanism

## Conclusion

**Approved for launch.** The API token implementation is well-designed, follows security best practices, and has comprehensive test coverage. All security invariants are properly enforced, particularly the critical requirement that API tokens cannot be used on the content domain.

The minor issues identified are UX improvements that can be addressed in future iterations.
