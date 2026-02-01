# CLI Simplification Plan

A comprehensive review of the `cli/` directory to identify opportunities for simplification. The goal is to reduce complexity, eliminate dead code, and consolidate duplicated logic.

## Summary

| Area | Files Reviewed | Issues Found | Est. Lines Removed |
|------|----------------|--------------|-------------------|
| `src/build/` | 11 files | 9 issues | ~80 lines |
| `src/cloud/` | 3 files | 2 issues | ~90 lines |
| `src/cmd/` | 16 files | 10 issues | ~200 lines |
| `src/config/` | 10 files | 7 issues | ~150 lines |
| `src/*.ts` (root) | 5 files | 7 issues | ~50 lines |
| `template/` | 25 files | 10 issues | ~70 lines |
| `test/` | 63 files | 9 issues | ~600 lines |
| `scripts/` + `patches/` | 3 files | 2 issues | ~80 lines |
| **Total** | | **56 issues** | **~1,320 lines** |

---

## High Priority (Bugs & Dead Code)

### 1. Delete Unused `auth-client.ts` (88 lines)

**File:** `cli/src/cloud/auth-client.ts`

The entire file is dead code. It was created for BetterAuth's device authorization flow but was never integrated—the CLI uses a custom HTTP callback-based login flow instead.

**Evidence:**
- `createBetterAuthClient` is exported but never imported anywhere
- No references to `auth-client` in any imports
- The CLI login in `cmd/cloud/auth.ts` uses `waitForCallback`, not BetterAuth

**Action:** Delete the file entirely.

---

### 2. Fix Bug: `entry.relativePath` vs `entry.relPath`

**File:** `cli/src/build/steps/05b-render-server.ts` (lines 28, 41)

The code references `entry.relativePath` but the `Entry` class defines `relPath`:

```typescript
// Current (buggy)
const sourcePath = entry.relativePath;

// Should be
const sourcePath = entry.relPath;
```

---

### 3. Remove Dead `getHtmlOutputPath` Function

**File:** `cli/src/build/steps/02b-check-conflicts.ts` (lines 72-81)

This function is defined but never called and references an `Entry` type that isn't imported.

**Action:** Delete lines 72-81.

---

### 4. Delete Deprecated Config Files (~80 lines)

**Files:**
- `cli/src/config/user-secrets.ts` (36 lines) - Entirely deprecated
- `cli/src/config/user-config.ts` (51 lines) - Mostly deprecated

**Actions:**
1. Move `getServerUrl()` and `getDefaultServerUrl()` to `paths.ts`
2. Delete both files
3. Remove exports and tests for deprecated functions

---

### 5. Remove Unused TOML Parser

**File:** `cli/src/config/toml.ts` (lines 13-40)

The custom `parseTOML` function is never used in application code. `project-config.ts` imports `parse` directly from `smol-toml`.

**Action:** Remove `parseTOML` function and its tests.

---

### 6. Remove Unnecessary Patch

**File:** `cli/patches/estree-util-build-jsx@3.0.1.patch`

This patch only changes a JSDoc comment in documentation—it has zero runtime impact.

**Actions:**
1. Delete the patch file
2. Remove `patchedDependencies` from `package.json`

---

### 7. Remove console.log from Production Template

**File:** `cli/template/_build/entry-client.tsx` (lines 21-25)

```typescript
// Remove these debug statements
console.log('Hydrating mdx component');
console.log('Rendering mdx component');
```

These appear in every user's browser console on every page load.

---

### 8. Delete Unused Template Asset

**File:** `cli/template/public/DVD_logo.svg`

Not referenced anywhere in the template code or sample pages.

---

## Medium Priority (Consolidation)

### 9. Extract `createZip()` to Shared Utility

**Files:** `cli/src/cmd/cloud/deploy.ts` and `cli/src/cmd/cloud/publish.ts`

Both files contain identical `createZip()` functions (31 lines each).

**Action:** Move to a shared utility file.

---

### 10. Consolidate or Clarify deploy.ts vs publish.ts

These files are ~85% identical. Either:
- Merge them if they serve the same purpose
- Have one call the other
- Document why both exist if there's a valid reason

---

### 11. Extract Server Port Fallback Logic

**Files:** `cli/src/cmd/dev.ts` and `cli/src/cmd/preview.ts`

Both implement similar server startup with port fallback. Extract to shared module:

```typescript
interface ServerOptions {
  buildDir: string;
  port: number;
  maxAttempts?: number;
  liveReload?: boolean;
}

async function startServerWithFallback(options: ServerOptions): Promise<{
  server: ReturnType<typeof Bun.serve>;
  port: number;
}>
```

---

### 12. Use Existing `openBrowser()` Utility

**Files:** `cli/src/cmd/dev.ts` (lines 257-264) and `cli/src/cmd/preview.ts` (lines 98-101)

Both duplicate the platform detection logic. Import `openBrowser()` from `util.ts` instead.

---

### 13. Consolidate Date Formatting Functions

**Files:** `cli/src/cmd/cloud/projects.ts` and `cli/src/cmd/cloud/tokens.ts`

Move `formatDate()`, `formatDateTime()`, and `formatRelativeTime()` to a shared utility.

---

### 14. Extract Secure JSON File Utilities

**Files:** `cli/src/config/credentials.ts` and `cli/src/config/cf-access.ts`

Both have nearly identical load/save patterns with 0o600 permissions. Extract:

```typescript
export async function loadSecureJsonFile<T>(path: string): Promise<T | null>
export async function saveSecureJsonFile<T>(path: string, data: T): Promise<void>
```

---

### 15. Consolidate `BunBuildResult` Type

**Files:** `cli/src/build/bundler.ts` (line 4) and `cli/src/build/types.ts` (line 13)

Keep only the definition in `types.ts` and import it in `bundler.ts`.

---

### 16. Extract Shared MDX JSX Types

**Files:** `cli/src/build/plugins/remark-auto-import.ts` and `cli/src/build/plugins/remark-not-prose.ts`

Both define identical `MdxJsxAttribute` and `JsxElementNode` types. Create `plugins/types.ts`.

---

### 17. Extract Shared `isRelativePath` Function

**Files:** `cli/src/build/plugins/rehype-image-paths.ts` and `cli/src/build/plugins/rehype-link-paths.ts`

Move unified implementation to `cli/src/build/util.ts`:

```typescript
export function isRelativePath(path: string): boolean {
  const nonRelativePrefixes = ['/', 'http://', 'https://', '//', '#', 'mailto:', 'tel:', 'data:'];
  return !nonRelativePrefixes.some(prefix => path.startsWith(prefix));
}
```

---

### 18. Simplify CF Access Retry Logic

**File:** `cli/src/cloud/request.ts`

The CF Access authentication check and retry appears twice (lines 224-231 and 261-267). Extract to helper.

---

### 19. Simplify TodoList Template Component

**File:** `cli/template/pages/components/TodoList.tsx`

The custom pub/sub system (lines 18-86) is over-engineered for a demo. Replace with standard useState + localStorage pattern (~40 lines saved).

---

## Low Priority (Cleanup)

### 20. Remove Unused Import in tokens.ts

**File:** `cli/src/cmd/cloud/tokens.ts` (line 17)

`getLoggedInServers` is imported but never used.

---

### 21. Use `request` Helper in tokens.ts

**File:** `cli/src/cmd/cloud/tokens.ts` (lines 265-275)

Uses raw `fetch` instead of the shared `request` helper for token validation.

---

### 22. Fix Invalid Tailwind Class

**File:** `cli/template/pages/components/Counter.tsx` (line 7)

Change `justify-left` to `justify-start` (Tailwind doesn't have `justify-left`).

---

### 23. Move Marquis Animation to CSS

**File:** `cli/template/pages/components/Marquis.tsx` (lines 14-22)

Inline `<style>` tags get duplicated on each render. Move keyframes to `tailwind.css`.

---

### 24. Make `nodeModulesDir()` Synchronous

**File:** `cli/src/build/context.ts` (lines 93-95)

This async method does no async work:

```typescript
// Before
async nodeModulesDir(): Promise<string> {
  return path.resolve(this.rootDir, 'node_modules');
}

// After
get nodeModulesDir(): string {
  return path.resolve(this.rootDir, 'node_modules');
}
```

---

### 25. Inline `createCloudContext` Helper

**File:** `cli/src/index.ts` (lines 71-76)

This trivial wrapper could be inlined at call sites.

---

### 26. Evaluate Custom Parallel Test Runner

**File:** `cli/scripts/test-parallel.ts` (81 lines)

Bun's test runner has built-in parallelism. This script may be redundant.

---

## Test Improvements

### 27. Extract `runCliCapture` to Shared Utility

**Files:** 3 e2e test files duplicate this helper

Move to `cli/test/e2e/util.ts`.

---

### 28. Create Test Fixture Helper

~35 e2e tests repeat the same setup pattern:

```typescript
export async function withSandboxProject(
  testFn: (sandboxDir: string, tempDir: string) => Promise<void>,
  prefix?: string
)
```

---

### 29. Consolidate Component Injection Tests

6 separate files test similar functionality. Consolidate into single file with `test.each()`.

---

### 30. Consolidate Checkout/Eject Tests

5 separate files could be merged into `eject-command.test.ts`.

---

### 31. Remove Over-Tested Unit Tests

**Files:** `cli/test/unit/cloud/api-server-url.test.ts` (~377 lines) and `cli/test/unit/cloud/api-cf-access.test.ts` (~322 lines)

These test inline mock functions, not actual code. Many tests are trivial (testing string concatenation).

---

### 32. Remove Meaningless Test

**File:** `cli/test/e2e/cloud-server-url-flag.test.ts` (lines 157-163)

```typescript
// This tests nothing
const expectedMode = 0o600;
expect(expectedMode).toBe(0o600);
```

---

## Implementation Order

### Phase 1: Quick Wins (No Risk)
1. Delete `auth-client.ts`
2. Delete `DVD_logo.svg`
3. Remove patch file
4. Remove console.logs from entry-client.tsx
5. Fix `relativePath` bug
6. Remove dead `getHtmlOutputPath` function
7. Fix `justify-left` Tailwind class

### Phase 2: Config Cleanup
8. Delete deprecated config files
9. Remove unused TOML parser
10. Extract secure JSON utilities

### Phase 3: Command Consolidation
11. Extract `createZip()` to shared utility
12. Use `openBrowser()` everywhere
13. Extract server creation helper
14. Consolidate date formatting

### Phase 4: Build Pipeline
15. Consolidate `BunBuildResult` type
16. Extract shared plugin types
17. Extract `isRelativePath`
18. Simplify CF Access retry

### Phase 5: Templates
19. Simplify TodoList component
20. Move Marquis animation to CSS

### Phase 6: Tests
21. Extract shared test utilities
22. Create test fixture helper
23. Consolidate similar test files
24. Remove over-tested/meaningless tests

---

## Notes

- All changes should be verified with `bun ops server -i staging test` before merging
- Some consolidations may reveal that `deploy.ts` and `publish.ts` serve distinct purposes—investigate before merging
- The parallel test runner should be evaluated against Bun's native parallelism before removal
