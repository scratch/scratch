# Block 3 Review: Content Token URL Cleanup

**Risk Level: Medium** — Defense-in-depth security measure

## Summary

This change cleans content tokens (`_ctoken`) and share tokens (`token`) from URLs via server-side redirect. After validating a token and setting a cookie, the server redirects to the same URL without the token parameter.

**Key files:**
- `server/src/lib/content-serving.ts` — Core logic for token tracking and redirect
- `server/src/routes/pages.ts` — Consumes the auth result (no changes specific to this feature)
- `ops/commands/server/test.ts` — Integration test for URL cleanup

**Commit:** `5096fb5 Add content token URL cleanup via server-side redirect`

## What Changed

### 1. ContentAuthResult interface expanded (content-serving.ts:109-114)

```typescript
export interface ContentAuthResult {
  user: { id: string; email: string } | null
  hasAccess: boolean
  tokenFromUrl?: boolean      // Content token was in URL (not cookie)
  shareTokenFromUrl?: boolean // Share token was in URL (not cookie)
}
```

Two new boolean flags track whether a token came from the URL rather than a cookie.

### 2. Token source tracking in authenticateContentRequest (content-serving.ts:125-204)

- `contentTokenFromUrl` is set to `true` when a valid `_ctoken` is found in the URL (line 149)
- `shareTokenUsedFromUrl` is set to `true` when a valid `token` is found in the URL **and** no cookie exists (line 185)

### 3. Redirect logic in serveProjectContent (content-serving.ts:252-259)

```typescript
// Redirect to clean URL if token was in URL (cookie has been set)
if (authResult.tokenFromUrl || authResult.shareTokenFromUrl) {
  const cleanUrl = new URL(c.req.url)
  cleanUrl.searchParams.delete('_ctoken')
  cleanUrl.searchParams.delete('token')
  return c.redirect(cleanUrl.toString(), 302)
}
```

## Questions to Answer

### 1. Does the redirect work correctly with fragment identifiers (#)?

**Answer: No, but this is an inherent limitation of server-side redirects.**

Fragment identifiers (e.g., `#section`) are never sent to the server — the browser strips them. When a request is made to `https://pages.example.com/user/project/?_ctoken=abc#section`, the server only sees `https://pages.example.com/user/project/?_ctoken=abc`.

The redirect removes `_ctoken` and sends back a `302` to `https://pages.example.com/user/project/`. The fragment is lost because:
1. It was never part of the server's view of the URL
2. Server-side redirects cannot preserve fragments they never received

**Mitigation:** This is a fundamental web platform limitation. To preserve fragments through auth flows would require client-side JavaScript in the auth page to capture and restore the hash. For this use case (private content access), losing the fragment is acceptable — users can navigate to their desired section after load.

### 2. Are there any edge cases where the token might not be cleaned?

**Yes, there is one edge case with share tokens:**

**The bug:** If a share token is in the URL AND the same token already exists in the cookie, the redirect does NOT happen.

Looking at line 184:
```typescript
if (shareTokenFromUrl && !shareTokenFromCookie) {
  shareTokenUsedFromUrl = true
```

The condition `!shareTokenFromCookie` means if the cookie already exists, `shareTokenUsedFromUrl` stays `false`, and no redirect occurs.

**Scenario:**
1. User visits `?token=abc` → cookie set, redirect to clean URL ✅
2. User bookmarks URL with `?token=abc` (before redirect completes)
3. User visits bookmarked URL → cookie already exists, no redirect, token stays in URL ❌

**Impact:** Low. The token remains visible but:
- User explicitly bookmarked the dirty URL
- Share tokens are project-scoped (can't access other projects)
- This is defense-in-depth, not critical security

**Fix:** Remove the `!shareTokenFromCookie` check. Set `shareTokenUsedFromUrl = true` whenever `shareTokenFromUrl` is truthy and valid. The cookie write can be gated (don't overwrite existing), but the redirect should still happen.

**Note:** Content tokens don't have this bug — `contentTokenFromUrl` is set based only on `tokenFromUrl` existing, not on cookie state.

## Code Quality Assessment

### Simplicity ✅
The implementation is straightforward — track token source, redirect if from URL. No over-engineering.

### Clarity ✅
- Clear comments explaining the purpose
- Variable names are descriptive (`contentTokenFromUrl`, `shareTokenUsedFromUrl`)
- Logic flow is easy to follow

### Correctness ⚠️
- Content token cleanup: Correct
- Share token cleanup: Has edge case bug (see above)
- 302 redirect: Correct choice (not 301, which would be cached)
- Cookie is set before redirect: Correct order

### Consistency ⚠️
- Inconsistency between content token and share token logic
- Content tokens: redirect whenever token is in URL
- Share tokens: redirect only if cookie wasn't already set

### Security ✅
- Tokens are correctly deleted from URL
- Cookie is properly set with path-scoping, httpOnly, secure, sameSite
- Redirect uses 302 (temporary) so browsers don't cache the redirect

## Test Coverage

The integration test (ops/commands/server/test.ts) covers:
1. Getting a content token via `/auth/content-access`
2. Requesting private content with token in URL
3. Verifying 302 redirect to clean URL
4. Verifying cookie was set
5. Verifying content is served with just the cookie

**Missing test coverage:**
- Share token URL cleanup (not tested)
- Edge case where cookie already exists (not tested)
- Multiple query params preserved during redirect (not tested)

## Recommendations

### Must Fix

None — the share token edge case is low-risk and doesn't affect security.

### Should Fix

**1. Fix share token redirect inconsistency** ✅ FIXED

Changed the logic so `shareTokenUsedFromUrl` is set whenever token is from URL, but cookie write is still conditional:

```typescript
if (shareTokenFromUrl) {
  shareTokenUsedFromUrl = true
  if (!shareTokenFromCookie) {
    setTokenCookie(c, shareTokenCookieName, shareToken, cookiePath, 60 * 60 * 24)
  }
}
```

**2. Extracted `setTokenCookie` helper** ✅ DONE

Created a helper function to consolidate the cookie-setting logic that was duplicated between content tokens and share tokens:

```typescript
function setTokenCookie(
  c: Context<{ Bindings: Env }>,
  name: string,
  value: string,
  cookiePath: string,
  maxAge: number
): void {
  const isHttps = useHttps(c.env)
  setCookie(c, name, value, {
    path: cookiePath,
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    maxAge,
  })
}
```

### Nice to Have

1. Add integration test for share token URL cleanup
2. Add test case for multiple query params being preserved during redirect
3. Document the fragment limitation in `server/CLAUDE.md`

## Conclusion

The content token URL cleanup feature is well-implemented and achieves its defense-in-depth goal. The edge case with share tokens has been fixed, and common cookie-setting logic has been consolidated.

**Verdict: Approved**
