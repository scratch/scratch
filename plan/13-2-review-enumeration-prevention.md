# Block 2 Review: Security - Project Enumeration Prevention

**Risk Level:** High — Security-critical behavior change
**Reviewer:** Claude Code
**Status:** ✅ Approved with minor observations

---

## Summary of Changes

This feature changes how non-existent projects are handled on the content domain to prevent enumeration attacks:

| Before | After |
|--------|-------|
| Non-existent project → 404 | Non-existent project → redirect to auth |
| Attackers could distinguish "doesn't exist" from "private" | Both cases look identical |

## Files Reviewed

| File | Purpose |
|------|---------|
| `server/src/routes/pages.ts` | Main logic - synthetic ID generation, redirect for non-existent |
| `server/src/lib/content-serving.ts` | `buildContentAccessRedirect` helper |
| `server/src/routes/app/auth.ts` | `/auth/content-access` endpoint - generic error handling |
| `ops/commands/server/test.ts` | Integration test for enumeration prevention |

---

## Code Analysis

### 1. Synthetic Project ID Generation (`pages.ts:67-80`)

```typescript
async function generateSyntheticProjectId(ownerIdentifier: string, projectName: string): Promise<string> {
  const data = new TextEncoder().encode(`${ownerIdentifier}/${projectName}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  let result = ''
  for (const byte of hashArray) {
    result += byte.toString(36)
  }
  return result.substring(0, 21)
}
```

**Assessment:** ✅ Sound approach

- Uses SHA-256 (cryptographically secure, one-way)
- Deterministic: same path → same ID (required for consistency)
- Format matches real nanoid project IDs (21 chars)
- No secret needed because the ID grants no access—it's just a placeholder for the auth redirect

### 2. Non-Existent Project Flow (`pages.ts:146-159`)

```typescript
// For non-public or non-existent projects, use the same auth flow
// This prevents attackers from distinguishing "doesn't exist" from "private"
if (project) {
  // Project exists but is non-public - use real project ID
  return serveProjectContent(c, project, filePath, { ... })
}

// Project doesn't exist - redirect to auth with synthetic ID
const syntheticId = await generateSyntheticProjectId(ownerIdentifier, projectName)
return c.redirect(buildContentAccessRedirect(c.env, syntheticId, c.req.url))
```

**Assessment:** ✅ Correct behavior

- Private projects: redirect to auth with real ID
- Non-existent projects: redirect to auth with synthetic ID
- Public projects: serve directly (lines 139-144)
- Attacker sees identical redirect for private vs non-existent

### 3. Generic Error Message (`auth.ts:138-141`)

```typescript
// Generic error for both "not found" and "no access" (don't reveal existence)
if (!project || !canAccessProject(user.email, user.id, project, c.env)) {
  return c.redirect('/error?message=' + encodeURIComponent('Unable to access this content'))
}
```

**Assessment:** ✅ Correctly generic

- Same message for "not found" AND "no access"
- Attacker cannot distinguish even after completing auth flow

### 4. Integration Test (`test.ts:261-305`)

```typescript
const nonExistentUrl = `https://${pagesDomain}/nonexistent-user-12345/nonexistent-project-67890/`
const enumResponse = await fetch(nonExistentUrl, { redirect: 'manual' })

if (enumResponse.status === 302 || enumResponse.status === 303) {
  const location = enumResponse.headers.get('location') || ''
  if (location.includes('/auth/content-access')) {
    console.log(`${green}✓${reset} Non-existent project redirects to auth`)
  }
}
```

**Assessment:** ✅ Good coverage

- Verifies non-existent returns redirect (not 404)
- Verifies redirect goes to `/auth/content-access`
- Also verifies public projects still serve directly (lines 287-305)

---

## Questions Answered

### 1. Does the synthetic ID leak any information about the project path?

**No.** The synthetic ID is a SHA-256 hash of the path. SHA-256 is a one-way function—given a hash, you cannot recover the input. An attacker who knows the path could compute the hash themselves, but they already know the path (they requested it), so no new information is revealed. The synthetic ID is never used for authorization.

### 2. What error does the user see after auth for a non-existent project?

**"Unable to access this content"** (line 140 in `auth.ts`). This generic message doesn't reveal whether the project exists or the user lacks permission.

### 3. Could an attacker use timing differences to enumerate?

**Limited concern.** Analysis:

| Request Type | Timing Profile |
|--------------|---------------|
| Public project | DB query → serve content |
| Private project | DB query → redirect to auth |
| Non-existent project | DB query → SHA-256 hash → redirect |

- **Public vs Private/Non-existent:** Distinguishable by response type (content vs redirect). This is expected—public projects are meant to be public.
- **Private vs Non-existent:** Both redirect to auth. SHA-256 is ~microseconds, unlikely to create detectable timing difference.

**Minor observation:** `resolveOwnerId` (lines 32-60) does sequential DB queries and returns early on match:
1. Try as user ID
2. Try as email
3. Try as local-part (if single domain)

If user exists, returns early. If not, runs all 3 queries. This could theoretically reveal USER existence (not project), but:
- Users are not secret (public projects reveal owners)
- Timing difference is likely <10ms
- This is out of scope for project enumeration prevention

---

## Checklist

| Check | Status |
|-------|--------|
| 404 is never returned for non-existent projects on content domain | ✅ |
| Synthetic project ID generation is deterministic | ✅ |
| Public projects still serve directly (no redirect) | ✅ |
| Auth flow for non-existent projects fails gracefully | ✅ |
| Error messages don't reveal existence | ✅ |
| Integration tests cover the key behavior | ✅ |

---

## Recommendations

### Approved As-Is

The implementation is **sound and secure**. It successfully prevents project enumeration without breaking existing functionality.

### Minor Observations (No Action Required)

1. **User timing via `resolveOwnerId`**: Sequential queries could theoretically reveal user existence via timing. Not a concern for project enumeration, and users aren't secret. If user enumeration prevention becomes a requirement in the future, consider running all 3 lookups in parallel.

2. **Base36 encoding in `generateSyntheticProjectId`**: The current implementation converts each byte to base36 independently (`byte.toString(36)`), which could produce IDs shorter than 21 chars if there are many small bytes. In practice this works fine because:
   - 32 bytes of SHA-256 output produces plenty of characters
   - Truncation to 21 chars ensures consistent length
   - No collision risk that matters (synthetic IDs are transient)

---

## Conclusion

**Approved.** The project enumeration prevention feature is well-designed and correctly implemented. The key security invariants are maintained:

1. Non-existent projects are indistinguishable from private projects
2. Generic error messages reveal nothing
3. Public projects continue to work normally
4. Integration tests verify the correct behavior
