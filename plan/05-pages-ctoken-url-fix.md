# Fix Content Token URL Exposure

## Problem

When a user authenticates to view a private page, the content token (JWT) is passed in the URL:

```
pages.example.com/user/project/?_ctoken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

This leaves the token visible in browser history and could leak via Referer headers.

## Why This Is Lower Risk Than It Appears

The token is **project-scoped** - it only grants access to the specific project in the URL. Consider the threat model:

- If a malicious project owner's JS captures a visitor's token, that token only grants access to the attacker's own project (which they already have full access to)
- The token cannot access other projects or impersonate the user on the app subdomain
- Tokens expire in 1 hour
- Modern browsers default to `strict-origin-when-cross-origin` Referer policy, which strips query params for cross-origin requests

## Solution: Server-Side Redirect

Instead of serving content with the token in the URL, redirect to a clean URL after setting the cookie. This is simpler and more robust than client-side cleanup.

When a request arrives with `?_ctoken=...` or `?token=...` (share token):
1. Validate the token and set the cookie (already happens)
2. Redirect to the same URL without the token parameter
3. Subsequent request uses cookie, URL is clean

**Benefits over client-side script injection:**
- No HTML parsing/modification needed
- Works for all content types (JS, CSS, images), not just HTML
- Browser history **never** contains the token
- Simpler implementation (~5 lines vs complex HTML manipulation)
- No streaming body concerns

**Downside:** One extra HTTP round-trip, but only on first visit after auth.

## Implementation

**File:** `server/src/lib/content-serving.ts`

### 1. Update ContentAuthResult interface

```typescript
export interface ContentAuthResult {
  user: { id: string; email: string } | null
  hasAccess: boolean
  tokenFromUrl?: boolean      // NEW: content token was in URL (not cookie)
  shareTokenFromUrl?: boolean // NEW: share token was in URL (not cookie)
}
```

### 2. Track token source in authenticateContentRequest

Around line 144 (content token handling):
```typescript
if (tokenFromUrl) {
  // ... existing cookie setting code ...
}
```
Add tracking and return `tokenFromUrl: !!tokenFromUrl` when content token was used.

Around line 179 (share token handling):
```typescript
if (shareTokenFromUrl && !shareTokenFromCookie) {
  // ... existing cookie setting code ...
}
```
Add tracking and return `shareTokenFromUrl: true` when share token was from URL.

### 3. Add redirect in serveProjectContent

Inside the `if (!isPublic)` block, after the access check succeeds:

```typescript
if (!isPublic) {
  const authResult = await authenticateContentRequest(c, project, options.cookiePath)

  if (!authResult.hasAccess) {
    // ... existing handling (redirect to auth or 404) ...
  }

  // NEW: Redirect to clean URL if token was in URL
  if (authResult.tokenFromUrl || authResult.shareTokenFromUrl) {
    const cleanUrl = new URL(c.req.url)
    cleanUrl.searchParams.delete('_ctoken')
    cleanUrl.searchParams.delete('token')
    return c.redirect(cleanUrl.toString(), 302)
  }
}
```

## Testing

### Integration Test

**File:** `ops/commands/server/test.ts`

Add a test case for the redirect behavior:

```typescript
// Step N: Test content token URL cleanup
console.log('Step N: Testing content token URL cleanup...')

// 1. Create a private project
const privateProjectName = generateRandomProjectName()
await runCommand([CLI_BIN, 'publish', tempDir, '--server', serverUrl, '--name', privateProjectName, '--visibility', 'private'])

// 2. Get content token via /auth/content-access endpoint
//    The CLI's bearer token (from device auth) should work for this endpoint
const returnUrl = `https://${pagesDomain}/${privateProjectName}/`
const contentAccessUrl = `https://${appDomain}/auth/content-access?project_id=${projectId}&return_url=${encodeURIComponent(returnUrl)}`

const tokenResponse = await fetch(contentAccessUrl, {
  headers: { 'Authorization': `Bearer ${cliToken}` },
  redirect: 'manual'  // Don't follow redirect, we want the Location header
})

// 3. Extract _ctoken from redirect Location header
const redirectLocation = tokenResponse.headers.get('Location')
const ctoken = new URL(redirectLocation).searchParams.get('_ctoken')

// 4. Request private page with ?_ctoken=<token>, expect 302 redirect
const pageWithToken = `${returnUrl}?_ctoken=${ctoken}`
const redirectResponse = await fetch(pageWithToken, { redirect: 'manual' })

if (redirectResponse.status === 302) {
  const cleanLocation = redirectResponse.headers.get('Location')
  const setCookie = redirectResponse.headers.get('Set-Cookie')

  if (cleanLocation === returnUrl && setCookie?.includes('_content_token')) {
    console.log(`${green}✓${reset} Content token redirect works`)
  }
}

// 5. Follow redirect (or use cookie directly), verify content served
const cookieHeader = redirectResponse.headers.get('Set-Cookie')
const finalResponse = await fetch(returnUrl, {
  headers: { 'Cookie': parseCookie(cookieHeader) }
})
if (finalResponse.ok) {
  console.log(`${green}✓${reset} Content served with cookie`)
}
```

**Note:** The CLI token is stored in `~/.scratch/credentials.json`. The test may need to read this or use the existing authenticated CLI commands to obtain project access.

## Documentation Updates

**File:** `server/CLAUDE.md`

Add to the Security Model section, after the existing "Security Invariants" subsection:

```markdown
### Token URL Cleanup

Both content tokens (`?_ctoken=...`) and share tokens (`?token=...`) are passed in URLs during auth flows. While the risk is low (tokens are project-scoped and short-lived), we clean URLs via server-side redirect:

1. Request arrives with token in URL
2. Server validates token, sets path-scoped cookie
3. Server redirects to same URL without token parameter
4. Browser history only contains the clean URL

This is a defense-in-depth measure. Even without it, the risk is limited because:
- Tokens are project-scoped (can't access other projects)
- Content tokens expire in 1 hour
- Modern browsers strip query params from cross-origin Referer headers
```

## Files Changed

1. `server/src/lib/content-serving.ts` - Add redirect when content token or share token came from URL
2. `server/CLAUDE.md` - Document token URL cleanup behavior
3. `ops/commands/server/test.ts` - Add integration test for redirect behavior
