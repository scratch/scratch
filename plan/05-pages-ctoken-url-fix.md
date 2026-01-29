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

## Solution: Client-Side URL Cleanup

Strip the token from the URL immediately after the page loads. This addresses:
- **Browser history**: Token removed before it persists
- **Referer leakage**: URL is clean before user clicks any external links
- **Clean URLs**: Better UX, no ugly token in address bar

## Implementation

**File:** `server/src/lib/content-serving.ts`

When serving a page where the token came from the URL (not cookie), inject a small script to clean the URL:

```typescript
// In authenticateContentRequest, track whether token came from URL
// Then in serveProjectContent, if tokenFromUrl was used, inject cleanup script
```

The cleanup script:

```javascript
(function(){
  if(location.search.includes('_ctoken')){
    var u=new URL(location);
    u.searchParams.delete('_ctoken');
    history.replaceState(null,'',u);
  }
})();
```

This should be injected into HTML responses only (not JS/CSS/images), at the start of `<head>` or end of `<body>`.

## Files Changed

1. `server/src/lib/content-serving.ts` - Inject cleanup script when token came from URL
