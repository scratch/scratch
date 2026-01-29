# Static Assets Handling Improvements

## Overview

This plan improves how static assets are handled in both the CLI build process and server file serving, with a focus on making `.md` and `.mdx` source files available as downloadable text alongside their compiled HTML versions.

## Current Behavior

### CLI Build (step 09-copy-static.ts)

- `--static` flag with modes: `assets` (default), `public`, `all`
- In `assets` mode: copies files from `pages/` **excluding** `.md`, `.mdx`, `.tsx`, `.jsx`, `.ts`, `.js`, `.mjs`, `.cjs`
- Always copies everything from `public/`
- No conflict detection between `pages/` and `public/`

### Server File Routing (content-serving.ts)

For a URL path `/foo`, tries in order:
1. `{deployId}/foo/index.html`
2. `{deployId}/foo.html`
3. `{deployId}/foo` (exact match)

### Current MIME Types (files.ts)

- `.txt` → `text/plain; charset=utf-8`
- `.md` → `text/markdown; charset=utf-8`
- `.mdx` → `application/octet-stream` (download)

---

## Proposed Changes

### CLI Changes

#### 1. Remove the `--static` flag

**Files to modify:**
- `cli/src/index.ts` - Remove `--static` option from build and dev commands
- `cli/src/build/types.ts` - Remove `static` from `BuildOptions`
- `cli/src/build/steps/09-copy-static.ts` - Remove mode logic

#### 2. New default static file behavior

Copy to `dist/`:
- **Everything from `public/`** - unchanged
- **Everything from `pages/` EXCEPT** `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`

This means `.md`, `.mdx`, and `.txt` files **WILL** be copied (unlike current `assets` mode which excludes them).

**Rationale:** Users may want to provide downloadable source files alongside the compiled HTML. Executable code files (JS/TS) are excluded because they're compiled into bundles.

#### 3. Rename `.mdx` to `.md` when copying

When copying static files from `pages/`:
- `pages/foo.mdx` → `dist/foo.md`
- `pages/foo.md` → `dist/foo.md` (unchanged)

**Rationale:** `.mdx` is a build-time format; the `.md` extension is more recognizable for download/viewing.

**File to modify:** `cli/src/build/steps/09-copy-static.ts`

### Server Changes

#### 1. Serve `.txt`, `.md`, `.mdx` as text

Update MIME types in `server/src/lib/files.ts`:

```typescript
'.txt': 'text/plain; charset=utf-8',   // unchanged
'.md': 'text/plain; charset=utf-8',    // was text/markdown
'.mdx': 'text/plain; charset=utf-8',   // was application/octet-stream
```

**Rationale:** `text/plain` displays in browser; `text/markdown` often triggers download.

#### 2. Redirect `.mdx` URLs to `.md`

In `server/src/lib/content-serving.ts`, before calling `findFile`:
- If the requested path ends with `.mdx`, redirect (301) to the same path with `.md` extension

**Example:** `/project/source.mdx` → 301 redirect → `/project/source.md`

**Rationale:** Matches the CLI renaming behavior. Old links to `.mdx` files continue to work.

**File to modify:** `server/src/lib/content-serving.ts` or `server/src/routes/pages.ts`

---

## Path Conflict Detection (New Build Step)

Add a new build step to detect and fail on path conflicts. This prevents subtle bugs where files silently overwrite each other.

### Pass 1: Source → Dist File Path Conflicts

Detect when two source files would produce the same file in `dist/`.

**Mappings to track:**

| Source | Dist Path |
|--------|-----------|
| `pages/foo.md` (static copy) | `dist/foo.md` |
| `pages/foo.mdx` (static copy, renamed) | `dist/foo.md` |
| `pages/foo.md` (HTML compilation) | `dist/foo/index.html` |
| `pages/foo.mdx` (HTML compilation) | `dist/foo/index.html` |
| `pages/foo/index.md` (HTML compilation) | `dist/foo/index.html` |
| `pages/image.png` | `dist/image.png` |
| `public/style.css` | `dist/style.css` |

**Conflict examples:**
- `pages/foo.md` + `pages/foo.mdx` → both produce `dist/foo.md` ❌
- `pages/foo.mdx` + `pages/foo/index.mdx` → both compile to `dist/foo/index.html` ❌
- `pages/logo.png` + `public/logo.png` → both produce `dist/logo.png` ❌
- `pages/data.mdx` + `public/data.md` → both produce `dist/data.md` ❌

**Algorithm:**
```
conflictMap = Map<distPath, sourcePath[]>

for each MD/MDX file in pages/:
  - Add HTML output path: getArtifactPath('.html') → conflictMap
  - Add static copy path (with .mdx→.md rename) → conflictMap

for each non-code static file in pages/:
  - Add copy path → conflictMap

for each file in public/:
  - Add copy path → conflictMap

for each (distPath, sources) in conflictMap:
  if sources.length > 1:
    report conflict
```

### Pass 2: Dist Path → URL Conflicts

Detect when two files in `dist/` would serve the same URL (per server routing logic).

**Server routing rules:**
For URL `/foo`, the server tries (in order):
1. `dist/foo/index.html`
2. `dist/foo.html`
3. `dist/foo` (exact)

**Conflict examples:**
- `dist/foo/index.html` + `dist/foo.html` → both serve URL `/foo` ❌
- `dist/foo/index.html` + `dist/foo` (file) → both serve URL `/foo` ❌
- `dist/foo.html` + `dist/foo` (file) → both serve URL `/foo` ❌

**Algorithm:**
```
urlMap = Map<urlPath, distPath[]>

for each file in dist/:
  urlPath = computeUrlPath(distPath)
  urlMap[urlPath].push(distPath)

for each (urlPath, distPaths) in urlMap:
  if distPaths.length > 1:
    report conflict

function computeUrlPath(distPath):
  if distPath ends with /index.html:
    return dirname(distPath)  # /foo/index.html → /foo
  if distPath ends with .html:
    return distPath without .html  # /foo.html → /foo
  return distPath  # /foo.txt → /foo.txt
```

**Note:** The `.mdx → .md` redirect doesn't create URL conflicts because `.mdx` files won't exist in `dist/` (they're renamed to `.md`).

### Implementation

**New file:** `cli/src/build/steps/08b-check-conflicts.ts`

Insert between step 08 (inject-frontmatter) and step 09 (copy-static), or at the very beginning of step 09 before any copying occurs.

**Error output example:**
```
Build failed: Path conflicts detected

  dist/foo.md is produced by multiple sources:
    - pages/foo.md
    - pages/foo.mdx

  URL /about is served by multiple files:
    - dist/about/index.html
    - dist/about.html

Remove or rename conflicting files to continue.
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `cli/src/index.ts` | Remove `--static` option |
| `cli/src/build/types.ts` | Remove `static` from `BuildOptions` |
| `cli/src/build/steps/09-copy-static.ts` | New default behavior, `.mdx→.md` rename |
| `cli/src/build/steps/08b-check-conflicts.ts` | **New file** - conflict detection |
| `cli/src/build/orchestrator.ts` | Add conflict check step |
| `cli/src/build/steps/index.ts` | Export new step |
| `server/src/lib/files.ts` | Update MIME types for `.md`, `.mdx` |
| `server/src/lib/content-serving.ts` | Add `.mdx→.md` redirect |

---

## Testing

### CLI Unit Tests

**New file:** `cli/test/unit/conflict-detection.test.ts`

Test the conflict detection algorithms in isolation:

```typescript
describe('conflict detection', () => {
  describe('Pass 1: source to dist path conflicts', () => {
    test('detects pages/foo.md + pages/foo.mdx conflict (both → dist/foo.md)')
    test('detects pages/foo.mdx + public/foo.md conflict (both → dist/foo.md)')
    test('detects pages/img.png + public/img.png conflict')
    test('detects pages/foo.mdx + pages/foo/index.mdx HTML output conflict')
    test('detects pages/foo.md + pages/foo/index.md HTML output conflict')
    test('allows pages/foo.mdx + pages/bar.mdx (no conflict)')
    test('allows pages/foo.mdx + public/foo.txt (different extensions)')
    test('handles nested paths: pages/a/b/c.mdx + public/a/b/c.md')
  })

  describe('Pass 2: dist to URL path conflicts', () => {
    test('detects foo/index.html + foo.html conflict (both serve /foo)')
    test('detects foo/index.html + foo (file) conflict')
    test('detects foo.html + foo (file) conflict')
    test('allows foo/index.html + bar/index.html (different URLs)')
    test('allows foo.md + foo/index.html (different URLs: /foo.md vs /foo)')
    test('handles root index.html correctly')
  })

  describe('computeUrlPath', () => {
    test('foo/index.html → /foo')
    test('foo/bar/index.html → /foo/bar')
    test('index.html → /')
    test('foo.html → /foo')
    test('foo.txt → /foo.txt')
    test('foo/bar.css → /foo/bar.css')
  })
})
```

### CLI E2E Tests

**Update file:** `cli/test/e2e/static-modes.test.ts` → rename to `cli/test/e2e/static-assets.test.ts`

Remove tests for `--static` flag (which is being removed) and add:

```typescript
describe('static asset copying', () => {
  describe('default behavior (no --static flag)', () => {
    test('copies .md files from pages/ to dist/', async () => {
      // Create pages/extra.md
      // Build
      // Verify dist/extra.md exists
    })

    test('copies .txt files from pages/ to dist/', async () => {
      // Create pages/notes.txt
      // Build
      // Verify dist/notes.txt exists
    })

    test('renames .mdx to .md when copying', async () => {
      // Create pages/article.mdx
      // Build
      // Verify dist/article.md exists (NOT dist/article.mdx)
    })

    test('excludes .js files from pages/', async () => {
      // Create pages/helper.js
      // Build
      // Verify dist/helper.js does NOT exist
    })

    test('excludes .jsx files from pages/', async () => {
      // Create pages/Component.jsx
      // Build
      // Verify dist/Component.jsx does NOT exist
    })

    test('excludes .ts files from pages/', async () => {
      // Create pages/util.ts
      // Build
      // Verify dist/util.ts does NOT exist
    })

    test('excludes .tsx files from pages/', async () => {
      // Create pages/Widget.tsx
      // Build
      // Verify dist/Widget.tsx does NOT exist
    })

    test('excludes .mjs and .cjs files from pages/', async () => {
      // Create pages/module.mjs, pages/require.cjs
      // Build
      // Verify neither exists in dist/
    })

    test('copies all files from public/ unchanged', async () => {
      // Create public/data.json, public/robots.txt
      // Build
      // Verify both exist in dist/ with same content
    })

    test('copies images and other assets from pages/', async () => {
      // Create pages/images/photo.png
      // Build
      // Verify dist/images/photo.png exists
    })

    test('preserves directory structure when copying', async () => {
      // Create pages/docs/guide/intro.md
      // Build
      // Verify dist/docs/guide/intro.md exists
    })
  })

  describe('MDX to MD rename edge cases', () => {
    test('handles deeply nested .mdx files', async () => {
      // Create pages/a/b/c/deep.mdx
      // Build
      // Verify dist/a/b/c/deep.md exists
    })

    test('handles .mdx with special characters in name', async () => {
      // Create pages/my-article_v2.mdx
      // Build
      // Verify dist/my-article_v2.md exists
    })
  })
})
```

**New file:** `cli/test/e2e/static-conflicts.test.ts`

```typescript
describe('static asset conflict detection', () => {
  describe('Pass 1: source to dist conflicts', () => {
    test('fails when pages/foo.md and pages/foo.mdx both exist', async () => {
      // Create both files
      // Build should fail with clear error message
      // Error should list both conflicting sources
    })

    test('fails when pages/file.png and public/file.png both exist', async () => {
      // Create both files
      // Build should fail
    })

    test('fails when pages/doc.mdx and public/doc.md both exist', async () => {
      // pages/doc.mdx → dist/doc.md
      // public/doc.md → dist/doc.md
      // Conflict!
    })

    test('fails when pages/about.mdx and pages/about/index.mdx both exist', async () => {
      // Both compile to dist/about/index.html
    })

    test('fails when pages/about.md and pages/about/index.md both exist', async () => {
      // Both compile to dist/about/index.html
    })

    test('error message lists all conflicting files', async () => {
      // Create conflict
      // Verify error message format includes:
      // - The dist path that has conflicts
      // - All source files that map to it
    })
  })

  describe('Pass 2: URL routing conflicts', () => {
    test('fails when dist would have both foo/index.html and foo.html', async () => {
      // This requires a static foo.html in public/ plus pages/foo.mdx
      // pages/foo.mdx → dist/foo/index.html (HTML compilation)
      // public/foo.html → dist/foo.html
      // Both serve URL /foo
    })

    test('error message shows URL and all files that serve it', async () => {
      // Verify error format shows:
      // - The URL path with conflicts
      // - All dist files that would serve it
    })
  })

  describe('non-conflicts (should succeed)', () => {
    test('allows pages/foo.mdx (compiles to HTML) + pages/foo.txt (static copy)', async () => {
      // pages/foo.mdx → dist/foo/index.html + dist/foo.md
      // pages/foo.txt → dist/foo.txt
      // Different paths, no conflict
    })

    test('allows pages/foo.md + public/bar.md', async () => {
      // Different names, no conflict
    })

    test('allows nested paths that look similar but differ', async () => {
      // pages/a/b.mdx + pages/ab.mdx
      // Different paths
    })
  })
})
```

### Server Tests

Server doesn't have unit tests currently; MIME type changes will be verified in integration tests.

**Updates to add to integration test:** `ops/commands/server/test.ts`

Add a new step after content verification:

```typescript
// Step N: Test static file serving
console.log('Step N: Testing static file serving...')

// First, create a project with static files to test
const staticTestDir = join(tmpdir(), `scratch-static-test-${Date.now()}`)
await runCommandInherit([CLI_BIN, 'create', staticTestDir])

// Add test files
await writeFile(join(staticTestDir, 'pages', 'source.mdx'), '# MDX Source\n\nHello world')
await writeFile(join(staticTestDir, 'pages', 'notes.txt'), 'Plain text notes')
await writeFile(join(staticTestDir, 'pages', 'readme.md'), '# Readme\n\nDocumentation')

// Build and deploy
const staticProjectName = generateRandomProjectName()
await runCommandInherit([
  CLI_BIN, 'publish', staticTestDir,
  '--server', serverUrl,
  '--visibility', 'public',
  '--name', staticProjectName,
])

// Test 1: .md file served as text/plain
const mdResponse = await fetch(`https://${pagesDomain}/${staticProjectName}/source.md`)
if (mdResponse.headers.get('content-type')?.startsWith('text/plain')) {
  console.log(`${green}✓${reset} .md served as text/plain`)
} else {
  console.error(`${red}✗${reset} .md not served as text/plain: ${mdResponse.headers.get('content-type')}`)
  testPassed = false
}

// Test 2: .txt file served as text/plain
const txtResponse = await fetch(`https://${pagesDomain}/${staticProjectName}/notes.txt`)
if (txtResponse.headers.get('content-type')?.startsWith('text/plain')) {
  console.log(`${green}✓${reset} .txt served as text/plain`)
} else {
  console.error(`${red}✗${reset} .txt not served as text/plain`)
  testPassed = false
}

// Test 3: .mdx URL redirects to .md
const mdxResponse = await fetch(`https://${pagesDomain}/${staticProjectName}/source.mdx`, {
  redirect: 'manual'  // Don't follow redirects automatically
})
if (mdxResponse.status === 301 && mdxResponse.headers.get('location')?.endsWith('/source.md')) {
  console.log(`${green}✓${reset} .mdx redirects to .md`)
} else {
  console.error(`${red}✗${reset} .mdx did not redirect: status=${mdxResponse.status}`)
  testPassed = false
}

// Test 4: Verify .mdx file doesn't exist in dist (was renamed to .md)
const mdxDirectResponse = await fetch(`https://${pagesDomain}/${staticProjectName}/source.mdx`, {
  redirect: 'follow'
})
// After following redirect, should get the .md content
const mdxContent = await mdxDirectResponse.text()
if (mdxContent.includes('MDX Source') || mdxContent.includes('Hello world')) {
  console.log(`${green}✓${reset} .mdx redirect serves correct content`)
} else {
  console.error(`${red}✗${reset} .mdx redirect content incorrect`)
  testPassed = false
}

// Test 5: HTML page still works (source.mdx compiled to /source/)
const htmlResponse = await fetch(`https://${pagesDomain}/${staticProjectName}/source/`)
if (htmlResponse.ok && htmlResponse.headers.get('content-type')?.includes('text/html')) {
  console.log(`${green}✓${reset} Compiled HTML page still accessible`)
} else {
  console.error(`${red}✗${reset} Compiled HTML page not accessible`)
  testPassed = false
}

// Cleanup static test project
await runCommand([CLI_BIN, 'projects', 'delete', staticProjectName, serverUrl, '--force'])
await rm(staticTestDir, { recursive: true, force: true })
```

### Test Summary

| Test Type | File | What It Tests |
|-----------|------|---------------|
| Unit | `cli/test/unit/conflict-detection.test.ts` | Conflict detection algorithms |
| E2E | `cli/test/e2e/static-assets.test.ts` | Static copying behavior, MDX→MD rename |
| E2E | `cli/test/e2e/static-conflicts.test.ts` | Build failures on conflicts |
| Integration | `ops/commands/server/test.ts` | MIME types, .mdx redirect, end-to-end |

### Running Tests

```bash
# CLI unit tests
bun ops cli test:unit

# CLI e2e tests
bun ops cli test:e2e

# Full integration test (includes server behavior)
bun ops server -i staging test
```

### Test Coverage Checklist

**CLI Static Copying:**
- [ ] .md files copied from pages/
- [ ] .mdx files renamed to .md when copied
- [ ] .txt files copied from pages/
- [ ] .js/.jsx/.ts/.tsx/.mjs/.cjs excluded from pages/
- [ ] All public/ files copied unchanged
- [ ] Directory structure preserved
- [ ] Nested paths handled correctly

**CLI Conflict Detection (Pass 1):**
- [ ] pages/foo.md + pages/foo.mdx conflict
- [ ] pages/file.ext + public/file.ext conflict
- [ ] pages/foo.mdx + public/foo.md conflict (after rename)
- [ ] HTML compilation conflicts (foo.mdx + foo/index.mdx)
- [ ] Error message format is clear and helpful

**CLI Conflict Detection (Pass 2):**
- [ ] foo/index.html + foo.html URL conflict
- [ ] foo/index.html + foo (file) URL conflict
- [ ] Error message shows URL and conflicting files

**Server MIME Types:**
- [ ] .md served as text/plain
- [ ] .txt served as text/plain
- [ ] .mdx served as text/plain (if somehow present)

**Server .mdx Redirect:**
- [ ] .mdx URLs return 301 redirect
- [ ] Redirect location is correct (.md extension)
- [ ] Following redirect serves correct content
