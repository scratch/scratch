# Block 4 Review: Static Assets & Conflict Detection

## Summary of Changes

This block improves static asset handling in the build system and adds conflict detection to catch ambiguous file configurations before they cause silent failures.

### Components

1. **Conflict Detection Build Step** (`cli/src/build/steps/02b-check-conflicts.ts`) - NEW
2. **Static File Copying** (`cli/src/build/steps/09-copy-static.ts`) - Modified
3. **Server .mdx Redirect** (`server/src/routes/pages.ts`) - Added
4. **MIME Type Updates** (`server/src/lib/files.ts`) - Modified
5. **Build Pipeline Registration** (`cli/src/build/orchestrator.ts`, `cli/src/build/steps/index.ts`)

---

## Detailed Analysis

### 1. Conflict Detection (`02b-check-conflicts.ts`)

**Purpose**: Detect conflicting files early in the build process rather than having one silently overwrite another.

**Two-Pass Detection**:

| Pass | What it detects | Example |
|------|-----------------|---------|
| Pass 1 | Source → Dist path conflicts | `pages/foo.md` + `pages/foo.mdx` → both produce `dist/foo.md` |
| Pass 2 | Dist → URL conflicts | `dist/foo/index.html` + `dist/foo.html` → both serve `/foo` |

**Key Functions**:

- `computeUrlPath(distPath)` - Maps dist files to URL paths per server routing rules
- `getStaticCopyDistPath(relPath)` - Handles `.mdx` → `.md` rename logic
- `computeMdxOutputPaths(relPath)` - Computes both HTML output and static copy paths
- `detectConflicts(pagesDir, staticDir)` - Main detection logic
- `formatConflictErrors(result)` - User-friendly error messages

**Observations**:

1. **Correctness**: The `computeUrlPath` function correctly mirrors server routing:
   - `foo/index.html` → `/foo`
   - `foo.html` → `/foo`
   - `foo.txt` → `/foo.txt` (exact)

2. **Duplicate `Entry` type**: Line 73 uses `Entry` type but the import is missing. Looking at the code, `getHtmlOutputPath` takes an `entry` parameter with `.name` property but the function isn't actually used - only `computeMdxOutputPaths` is called. **This is dead code** - `getHtmlOutputPath` is defined but never invoked.

3. **CODE_FILE_EXTS duplication**: The same constant is defined in both `02b-check-conflicts.ts` (line 7) and `09-copy-static.ts` (line 8). This could be extracted to a shared location.

4. **Glob scan efficiency**: The code runs two glob operations on `pagesDir`:
   - `**/*.{md,mdx}` for MD/MDX files
   - `**/*` for all files (then filters)

   This could be consolidated into one glob with filtering, though the performance impact is likely negligible for typical project sizes.

5. **Path normalization**: Windows path separators are handled (`\` → `/`), which is good for cross-platform compatibility.

**Recommendations**:
- Remove the unused `getHtmlOutputPath` function (lines 73-81)
- Consider extracting `CODE_FILE_EXTS` to a shared constants file

---

### 2. Static File Copying (`09-copy-static.ts`)

**Purpose**: Copy non-code static files from `pages/` and all files from `public/` to the build output.

**Behavior**:
- **Excluded**: `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs` (code files that get compiled)
- **Renamed**: `.mdx` → `.md` (matches server redirect behavior)
- **Preserved**: All other files with directory structure

**Observations**:

1. **Order of operations**: Step 09 runs AFTER HTML generation (step 07), so static copies happen late in the pipeline. The `public/` copy uses `fs.cp()` which may overwrite files from `pages/`. The conflict detection (step 02b) should catch this before it happens.

2. **Symlink handling**: Line 17 resolves symlinks for `pagesDir` with a comment about "view mode". This is defensive coding for when the pages directory might be symlinked.

3. **Recursive mkdir**: The code creates destination directories on-demand (line 45), which is correct since the build directory structure may not match the source.

4. **Missing `.md` exclusion**: The code excludes `.mdx` files from static copying (they get renamed), but `.md` files are NOT excluded. This means:
   - `pages/foo.md` → gets compiled to `dist/foo/index.html` (HTML)
   - `pages/foo.md` → also gets copied as `dist/foo.md` (static)

   This is intentional - the raw markdown is preserved alongside the compiled HTML. Conflict detection catches the case where this would cause problems.

**Recommendations**: None - the implementation is clean and correct.

---

### 3. Server .mdx Redirect (`server/src/routes/pages.ts`)

**Purpose**: Redirect `.mdx` URLs to `.md` since the CLI renames files during build.

**Implementation** (lines 87-92):
```typescript
if (pathname.endsWith('.mdx')) {
  const redirectUrl = new URL(url)
  redirectUrl.pathname = pathname.slice(0, -4) + '.md'
  return c.redirect(redirectUrl.toString(), 301)
}
```

**Observations**:

1. **301 Permanent Redirect**: Using 301 is correct - the rename is permanent and browsers/crawlers should update their references.

2. **Query string preservation**: The redirect preserves query parameters (via `new URL(url)`), which is important for share tokens and other URL parameters.

3. **Fragment handling**: URL fragments (`#anchor`) are NOT sent to the server, so they're preserved by the browser automatically.

4. **Early position**: This redirect happens early in the request handling (before project lookup), which is efficient.

**Recommendations**: None - implementation is correct.

---

### 4. MIME Types (`server/src/lib/files.ts`)

**Changes** (lines 24-26):
```typescript
'.txt': 'text/plain; charset=utf-8',
'.md': 'text/plain; charset=utf-8',
'.mdx': 'text/plain; charset=utf-8',
```

**Observations**:

1. **Charset specification**: Including `charset=utf-8` is correct for text files.

2. **MDX as text/plain**: Since `.mdx` files are redirected to `.md`, the `.mdx` MIME type is technically unused, but having it defined is defensive.

3. **No special markdown MIME type**: Using `text/plain` instead of `text/markdown` is a reasonable choice - browsers don't typically render markdown, so plain text is more predictable.

**Recommendations**: None.

---

### 5. Build Pipeline Integration

**orchestrator.ts** (line 40):
```typescript
checkConflictsStep, // Must run early to catch conflicts before build fails for other reasons
```

**Observations**:

1. **Correct ordering**: Conflict detection runs after `resetDirectoriesStep` but before `createTsxEntriesStep`. This is optimal - directories exist but expensive compilation hasn't started.

2. **Clear comment**: The comment explains why the step runs early.

---

## Test Coverage Analysis

### Unit Tests (`conflict-detection.test.ts`)

**Coverage**:
- `computeUrlPath`: 9 test cases covering all URL patterns
- `detectConflicts`: 11 test cases covering:
  - Pass 1: `.md`/`.mdx` conflicts, `pages/foo.mdx` vs `pages/foo/index.mdx`, cross-directory conflicts
  - Pass 2: URL routing conflicts (`foo.html` vs `foo/index.html`)
  - Non-conflicts: different files, different paths

**Quality**: Tests are well-structured with clear descriptions. The `afterEach` cleanup ensures no test pollution.

### E2E Tests (`static-assets.test.ts`)

**Coverage**:
- Copying various file types (`.md`, `.txt`, images)
- Excluding code files (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`)
- `.mdx` → `.md` rename behavior
- Directory structure preservation
- `public/` file copying

**Quality**: Comprehensive coverage of the static copying behavior.

### E2E Tests (`static-conflicts.test.ts`)

**Coverage**:
- Pass 1 conflicts: `foo.md`/`foo.mdx`, `pages/`/`public/` overlap, `foo.mdx`/`foo/index.mdx`
- Pass 2 conflicts: `foo/index.html` vs `foo.html` URL collision
- Non-conflicts: different names, different types

**Quality**: Good coverage of conflict scenarios with clear test names.

---

## Questions from Review Plan

### 1. Does conflict detection handle all file extension combinations?

**Answer**: Yes, with the following logic:
- MD/MDX files: Both HTML output path AND static copy path are tracked
- Code files (`.js`, etc.): Skipped entirely (they're compiled, not copied)
- Other static files: Tracked by their direct path
- `public/` files: Tracked by their direct path

The two-pass approach catches both "same output file" conflicts and "same URL" conflicts.

### 2. What's the user experience when a conflict is detected?

**Answer**: Build fails with a clear error message:
```
Build failed: Path conflicts detected

  dist/foo.md is produced by multiple sources:
    - pages/foo.md (static copy)
    - pages/foo.mdx (static copy)

Remove or rename conflicting files to continue.
```

The error identifies:
- Which dist path has the conflict
- All source files contributing to the conflict
- Actionable guidance

### 3. Are the error messages clear and actionable?

**Answer**: Yes. The messages:
- Identify the specific conflict location (`dist/foo.md`)
- List all conflicting sources with context (`pages/foo.md (static copy)`)
- Distinguish between HTML output and static copies
- For URL conflicts, show which dist files serve the same URL
- End with clear guidance: "Remove or rename conflicting files to continue"

---

## Potential Issues / Recommendations

### Issue 1: Dead Code
**Location**: `cli/src/build/steps/02b-check-conflicts.ts`, lines 73-81
**Description**: `getHtmlOutputPath(entry)` function is defined but never called. The `Entry` type is also referenced but not imported.
**Recommendation**: Remove the dead code.
**Severity**: Low (cosmetic)

### Issue 2: Duplicated Constants
**Location**: `CODE_FILE_EXTS` defined in both `02b-check-conflicts.ts` and `09-copy-static.ts`
**Description**: Same array defined twice; changes would need to be made in two places.
**Recommendation**: Extract to shared constants file (e.g., `cli/src/build/constants.ts`).
**Severity**: Low (maintainability)

### Issue 3: Missing `.sh` MIME Type (FIXED)
**Location**: `server/src/lib/files.ts`
**Description**: The install script (`curl -fsSL https://scratch.dev/install.sh | bash`) requires `.sh` files to be served with a text MIME type. Without this, the server returns `application/octet-stream`.
**Fix**: Added `.sh': 'text/plain; charset=utf-8'` to CONTENT_TYPES map.
**Severity**: Medium (breaks install flow)

---

## Security Considerations

None specific to this block. The changes are build-time only (conflict detection) and static file serving behavior. No authentication or authorization logic is affected.

---

## Verdict

**APPROVED** - The implementation is correct, well-tested, and improves the developer experience by catching configuration errors early with clear messages.

Minor cleanup recommendations:
1. Remove dead code (`getHtmlOutputPath`)
2. Consider extracting shared constants

These are not blocking issues.
