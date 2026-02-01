# Server Simplification Plan

A comprehensive review of `/server/src/` to identify opportunities to simplify and make the code more elegant.

## Executive Summary

The server code is well-organized overall, following the single-responsibility principle in most places. The main opportunities for simplification fall into three categories:

1. **Code Duplication** - Several patterns are repeated across multiple files
2. **Over-abstraction** - Some helpers/wrappers add complexity without sufficient value
3. **Dead Code** - Unused exports and divergent schema files

---

## High-Priority Recommendations

### 1. Consolidate Database Schemas

**Location:** `server/src/db/`

**Problem:** Two divergent schema files exist:
- `schema.sql` - Legacy schema with PostgreSQL/Neon conventions
- `schema.d1.sql` - Current D1 schema (missing `apikey` table!)

**Issues:**
- `schema.d1.sql` is missing the `apikey` table entirely
- `schema.sql` has `apikey` but migrations also create it (duplication)
- Namespace column exists in `schema.d1.sql` but not `schema.sql`
- Maintenance burden: changes must be made in multiple places

**Recommendation:**
1. Delete `schema.sql` (it's legacy)
2. Fix `schema.d1.sql` to include the missing `apikey` table
3. Document that `schema.d1.sql` is the source of truth for new instances
4. Migrations handle upgrades for existing instances

---

### 2. Remove Fake Transaction Support

**Location:** `server/src/db/client.ts:32-37`

**Problem:** The `transaction()` method doesn't actually provide transaction semantics:
```typescript
transaction: async <T>(fn: (tx: DbClient) => Promise<T>): Promise<T> => {
  // D1 doesn't have real transactions yet, but serializes writes
  // For now, just execute - single-writer model handles concurrency
  return fn(client)
}
```

Code in `deploys.ts` calls `db.transaction()` expecting rollback on error, but won't get it.

**Recommendation:** Either:
- Remove the `transaction` method entirely
- Or throw `NotImplementedError` to make it explicit that transactions aren't supported

---

### 3. Extract Cache Invalidation Helper

**Location:**
- `server/src/routes/app/api/projects.ts:267-288`
- `server/src/routes/app/api/deploys.ts:294-319`

**Problem:** Identical 20+ line cache invalidation logic duplicated in two files.

**Recommendation:** Create `lib/cache.ts`:
```typescript
export async function invalidateProjectCache(
  auth: AuthResult,
  projectName: string,
  env: Env
): Promise<void>
```

**Impact:** Removes ~40 lines of duplicated code.

---

### 4. Extract SQL Query Builder for Projects

**Location:** `server/src/routes/app/api/projects.ts` (lines 74-88, 113-127, 204-217)

**Problem:** Identical 15-line JOIN query appears 3 times:
```sql
SELECT p.*, u.email as owner_email, d.version as live_version,
  CAST(COUNT(all_d.id) AS INTEGER) as deploy_count,
  MAX(all_d.created_at) as last_deploy_at
FROM projects p
JOIN "user" u ON p.owner_id = u.id
LEFT JOIN deploys d ON p.live_deploy_id = d.id
LEFT JOIN deploys all_d ON all_d.project_id = p.id
... GROUP BY p.id, u.email, d.version
```

**Recommendation:** Create helper in `lib/api-helpers.ts`:
```typescript
function buildProjectDetailsQuery(whereClause: string): string
```

**Impact:** Removes ~45 lines of duplicated SQL.

---

### 5. Fix Duplicate getAuthenticatedUser Implementation

**Location:**
- `server/src/routes/app/ui.ts:23-35` (local, incomplete)
- `server/src/lib/api-helpers.ts:50-126` (shared, complete)

**Problem:** `ui.ts` has its own implementation that only handles CF Access and sessions, missing Bearer token and API key support. If auth patterns change, two implementations must be updated.

**Recommendation:** Delete the local implementation in `ui.ts` and import from `api-helpers.ts`.

---

### 6. Delete Unused Domain Functions

**Location:** `server/src/lib/domains.ts`

**Problem:** Three exported functions are never used externally:
- `getAppDomain()` - not used anywhere
- `getWwwDomain()` - only used inside `isWwwOrRootDomain()`
- `getRootDomain()` - only used inside `isWwwOrRootDomain()`

**Recommendation:**
1. Delete `getAppDomain()` entirely
2. Inline `getWwwDomain()` and `getRootDomain()` into `isWwwOrRootDomain()`

**Impact:** ~20 lines removed with zero functional impact.

---

## Medium-Priority Recommendations

### 7. Extract Project Ownership Check Helper

**Location:** `server/src/routes/app/api/share-tokens.ts` (lines 110-117, 197-204, 247-254)

**Problem:** Identical 8-line project lookup pattern repeated 3 times:
```typescript
const [project] = (await db`
  SELECT id FROM projects
  WHERE name = ${projectName} AND owner_id = ${auth.userId}
`) as { id: string }[]
if (!project) {
  return c.json({ error: 'Project not found', code: ErrorCodes.PROJECT_NOT_FOUND }, 404)
}
```

**Recommendation:** Create helper:
```typescript
export async function getProjectForUser(db, projectName, userId): Promise<{ id: string } | null>
```

**Impact:** ~24 lines removed.

---

### 8. Extract Visibility Validation Helper

**Location:**
- `server/src/routes/app/api/projects.ts` (PATCH endpoint)
- `server/src/routes/app/api/deploys.ts:47-60`

**Problem:** Same visibility validation pattern repeated:
```typescript
const visError = validateGroupInput(rawVisibility)
if (visError) return c.json({ error: visError, ... }, 400)
const parsed = parseGroup(rawVisibility)
if (visibilityExceedsMax(parsed, c.env)) return c.json({ error: ..., ... }, 400)
```

**Recommendation:** Create `lib/api-helpers.ts` helper:
```typescript
export function parseAndValidateVisibility(raw: string | undefined, env: Env):
  { valid: false; error: string; code: string } | { valid: true; value: string }
```

**Impact:** ~26 lines removed.

---

### 9. Split Large Functions in content-serving.ts

**Location:** `server/src/lib/content-serving.ts`

**Problem:** Two functions are doing too much:
- `authenticateContentRequest()` (77 lines) - handles 3 different auth methods
- `serveProjectContent()` (66 lines) - mixes caching, auth, and file serving

**Recommendation:** Break `authenticateContentRequest()` into:
- `authenticateViaContentToken()`
- `authenticateViaShareToken()`
- `authenticateViaCloudflareAccess()`

Extract caching from `serveProjectContent()` into helpers.

---

### 10. Consolidate Device Authorization Flows

**Location:** `server/src/routes/app/ui.ts`

**Problem:** Two parallel device flows with significant overlap:
- `/device` GET/POST (lines 154-291) - BetterAuth native device flow
- `/cli-login` GET/POST (lines 62-149) - Simpler custom flow

Both do nearly identical things: validate user, create session, redirect to localhost callback.

**Recommendation:** Consolidate these flows:
1. Keep `/cli-login` as primary endpoint
2. Extract shared session creation logic to helper
3. Consider deprecating `/device` or making it an alias

---

### 11. Add Share Token Feature Flag Middleware

**Location:** `server/src/routes/app/api/share-tokens.ts`

**Problem:** Identical feature flag check repeated 3 times (lines 57-62, 180-185, 230-235):
```typescript
if (!isShareTokensEnabled(c.env)) {
  return c.json({ error: 'Share tokens are disabled...', code: ... }, 403)
}
```

**Recommendation:** Convert to middleware applied to share-token routes:
```typescript
shareTokenRoutes.use('*', async (c, next) => {
  if (!isShareTokensEnabled(c.env)) {
    return c.json({ error: '...', code: ErrorCodes.SHARE_TOKENS_DISABLED }, 403)
  }
  await next()
})
```

---

### 12. Extract .mdx Redirect Middleware

**Location:**
- `server/src/routes/pages.ts:87-92`
- `server/src/routes/www.ts:35-40`

**Problem:** Identical `.mdx` → `.md` redirect logic in both files.

**Recommendation:** Extract to shared middleware in `lib/redirects.ts`.

---

### 13. Inline Helper Functions in pages.ts

**Location:** `server/src/routes/pages.ts`

**Problem:** Three helper functions are called only once each:
- `resolveOwnerId()` (24 lines)
- `getCookiePath()` (1 line - just returns a string template)
- `generateSyntheticProjectId()` (11 lines)

**Recommendation:** Inline these directly into the GET handler. Reduces abstraction layers and makes request flow clearer.

**Impact:** File shrinks from 160 to ~120 lines.

---

## Low-Priority Recommendations

### 14. Define Reusable Type Interfaces

**Location:** `server/src/routes/app/api/share-tokens.ts`

**Problem:** Same inline type definition repeated 4 times for query results.

**Recommendation:** Define once at top of file:
```typescript
interface ShareTokenRow {
  id: string
  project_id: string
  name: string
  duration: string
  expires_at: string
  revoked_at: string | null
  created_at: string
}
```

---

### 15. Extract URL Building Helpers

**Location:** Multiple files in `routes/app/`

**Problem:** Manual URL construction with `encodeURIComponent` repeated many times, easy to forget encoding.

**Recommendation:** Create URL builder helpers:
```typescript
function errorRedirectUrl(message: string): string
function getLocalhostCallbackUrl(params?: Record<string, string>): URL
```

---

### 16. Extract CSS/SVG from ui.ts

**Location:** `server/src/lib/ui.ts`

**Problem:**
- Line 9: 1000+ character minified CSS string
- Line 13: 2000+ character inline SVG

Makes the file hard to read and maintain.

**Recommendation:** Move CSS and SVG to separate files, import during build if possible.

---

### 17. Remove Unused Import in www.ts

**Location:** `server/src/routes/www.ts:20`

**Problem:** `buildContentAccessRedirect` is imported but never used (www.ts returns 404 for non-existent projects, not redirect).

**Recommendation:** Remove the unused import.

---

### 18. Delete renderLoginRedirectPage

**Location:** `server/src/lib/ui.ts:151-162`

**Problem:** Function is exported but never imported or used anywhere. Comment says "Used only if server-side redirect fails" but no code path uses it.

**Recommendation:** Delete the dead code.

---

### 19. Simplify domains.ts

**Location:** `server/src/lib/domains.ts`

**Problem:**
- `getAppBaseUrl()` and `getContentBaseUrl()` have duplicated protocol logic
- `isLocalhost()` called 3 times, could be inlined

**Recommendation:** Extract `buildBaseUrl(domain, env)` helper to eliminate duplication.

---

### 20. Remove Redundant Error Message Mapping

**Location:** `server/src/routes/app/auth.ts:79-87`

**Problem:** Maps only 2 error codes, fallback handles them anyway. Adds complexity for minimal benefit.

**Recommendation:** Remove the mapping, let all errors use standard fallback formatting.

---

## Summary by Impact

| Priority | Issue | Lines Saved | Files Affected |
|----------|-------|-------------|----------------|
| HIGH | Consolidate schemas | Maintenance burden | 2 |
| HIGH | Remove fake transactions | ~6 | 1 |
| HIGH | Cache invalidation helper | ~40 | 3 |
| HIGH | SQL query builder | ~45 | 2 |
| HIGH | Fix duplicate getAuthenticatedUser | ~15 | 2 |
| HIGH | Delete unused domain functions | ~20 | 1 |
| MEDIUM | Project ownership helper | ~24 | 2 |
| MEDIUM | Visibility validation helper | ~26 | 3 |
| MEDIUM | Split content-serving functions | Maintainability | 1 |
| MEDIUM | Consolidate device flows | ~50 | 1 |
| MEDIUM | Share token middleware | ~18 | 2 |
| MEDIUM | .mdx redirect middleware | ~12 | 3 |
| MEDIUM | Inline pages.ts helpers | ~40 | 1 |
| LOW | Reusable type interfaces | ~20 | 1 |
| LOW | URL building helpers | ~10 | 3 |
| LOW | Extract CSS/SVG | Maintainability | 1 |
| LOW | Remove unused imports | ~2 | 1 |
| LOW | Delete dead code | ~12 | 1 |
| LOW | Simplify domains.ts | ~8 | 1 |
| LOW | Remove error mapping | ~10 | 1 |

**Estimated total impact:** ~350+ lines of code removed or simplified across 15+ files, with improved maintainability and clearer architecture.

---

## Recommended Implementation Order

1. **Phase 1 - Quick Wins (Day 1)**
   - Delete unused domain functions (#6)
   - Remove fake transaction method (#2)
   - Delete unused imports and dead code (#17, #18, #20)

2. **Phase 2 - Schema Cleanup (Day 1-2)**
   - Fix schema.d1.sql, delete schema.sql (#1)

3. **Phase 3 - Extract Helpers (Day 2-3)**
   - Cache invalidation helper (#3)
   - SQL query builder (#4)
   - Project ownership helper (#7)
   - Visibility validation helper (#8)

4. **Phase 4 - Auth Consolidation (Day 3-4)**
   - Fix duplicate getAuthenticatedUser (#5)
   - Consolidate device flows (#10)
   - Add share token middleware (#11)

5. **Phase 5 - Polish (Day 4-5)**
   - Split content-serving functions (#9)
   - Inline pages.ts helpers (#13)
   - Extract .mdx redirect middleware (#12)
   - Remaining low-priority items
