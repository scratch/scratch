# TUI Changes Implementation Plan

Based on the review in `tui.md`, here are the changes to implement.

---

## 1. Consistent Tree Indentation

**Current state:** Tree output uses 2-space indentation in `formatFileTree()`.

**Change:** Audit all tree output to ensure consistent indentation across:
- `scratch create` output
- `scratch checkout --list`
- `scratch checkout` (created/restored files)

**Files to modify:**
- `src/util.ts` - `formatFileTree()` function (verify consistency)
- `src/cmd/create.ts` - verify usage
- `src/cmd/checkout.ts` - verify usage

**Implementation:**
- Review `formatFileTree()` to ensure it uses consistent 2-space base indentation
- Verify all callers pass files in the same format

---

## 2. No Trailing Slashes on Server URLs

**Current state:** URLs are displayed inconsistently - some with trailing slashes, some without.

**Change:** Always display server/pages URLs WITHOUT trailing slashes.

**Files to modify:**
- `src/cmd/cloud/deploy.ts` - `getPagesUrl()` and URL displays
- `src/cmd/cloud/projects.ts` - project URL displays
- `src/cmd/cloud/auth.ts` - server URL displays

**Implementation:**
- Add helper function `stripTrailingSlash(url: string): string`
- Apply to all URL displays in cloud commands
- Strip trailing slash from `project.url` if API includes one

---

## 3. Namespace Display: "global" instead of "_ (global)"

**Current state:** Shows `_ (global)` or `namespace: _ (global)` in various places.

**Change:** Show just `global` for the global namespace.

**Files to modify:**
- `src/cmd/cloud/deploy.ts` - line ~148: `namespace === GLOBAL_NAMESPACE ? '_ (global)' : namespace`
- `src/cmd/cloud/projects.ts` - line ~156: `${project.namespace || '_'} (${project.namespace ? 'custom' : 'global'})`
- `src/cmd/cloud/projects.ts` - other namespace displays

**Implementation:**
- Create helper `formatNamespace(ns: string | null): string` that returns "global" for null/GLOBAL_NAMESPACE
- Replace all instances of `|| '_'` with the helper
- Update deploy config display: `namespace: global` instead of `namespace: _ (global)`

---

## 4. Timestamps with Timezone

**Current state:** Timestamps show date/time but no timezone.

**Files to modify:**
- `src/cmd/cloud/projects.ts` - `formatDate()` and `formatDateTime()` functions

**Implementation:**
- Update `formatDateTime()` to include `timeZoneName: 'short'` option
- Example output: `Jan 27, 2025, 10:30 AM PST`

```typescript
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
```

---

## 5. Build Progress Output

**Current state:** Build only shows "Building Scratch project in ." and "Build completed in Xms"

**Change:** Show progress during build steps (without verbose mode).

**Files to modify:**
- `src/build/orchestrator.ts` - add progress output
- `src/cmd/build.ts` - potentially add summary

**Implementation:**
- Add `log.info()` calls for major phases (not every step):
  - "Installing dependencies..." (if needed)
  - "Compiling pages..."
  - "Generating HTML..."
  - "Copying assets..."
- Keep detailed step output for verbose mode only

**New output:**
```
Building Scratch project in .
  Installing dependencies...
  Compiling 5 pages...
  Generating HTML...
  Copying assets...
Build completed in 1234ms
```

---

## 6. Build File Count and Size

**Current state:** Build doesn't show output statistics.

**Change:** Show file count and total size after build completes.

**Files to modify:**
- `src/build/steps/11-copy-to-dist.ts` - collect stats
- `src/build/orchestrator.ts` - return/display stats
- `src/cmd/build.ts` - display summary

**Implementation:**
- In `copyToDistStep`, count files and total bytes copied
- Store in pipeline state outputs
- Display after build: `Built 42 files (256.3 KB) in 1234ms`

---

## 7. Deploy Shows Unzipped AND Zipped Size

**Current state:** Deploy shows `42 files, 256.3 KB` (unzipped only).

**Change:** Show both unzipped and zipped sizes.

**Files to modify:**
- `src/cmd/cloud/deploy.ts` - update zip stats display

**Implementation:**
- `createZip()` already returns `totalBytes` (unzipped) and `data` (zipped)
- Update display to show both:

```
Zipping dist/...
  42 files, 256.3 KB -> 64.2 KB
```

Or:
```
Zipping dist/...
  42 files
  Uncompressed: 256.3 KB
  Compressed:   64.2 KB
```

---

## 8. Consistent Interactive Prompt Styling

**Current state:** Prompts use @inquirer/prompts but may have inconsistent messaging.

**Change:** Ensure all prompts follow consistent patterns.

**Files to modify:**
- `src/cmd/cloud/auth.ts` - config prompt
- `src/cmd/cloud/deploy.ts` - project name, namespace selection
- `src/cmd/cloud/projects.ts` - delete confirmation, project selection
- `src/cmd/cloud/share.ts` - token name, duration selection
- `src/cmd/checkout.ts` - overwrite confirmation

**Implementation:**
- Audit all prompts for consistent patterns:
  - Text input: `? Question [default]: `
  - Confirmation: `? Question? (Y/n)`
  - Selection: `? Question:` with `>` indicator
- Ensure all use the same inquirer theme/settings
- Standardize prompt messages (e.g., always end questions with ":")

---

## 9. Add --dry-run for Deploy

**Current state:** Deploy always uploads.

**Change:** Add `--dry-run` flag to show what would be deployed without uploading.

**Files to modify:**
- `src/cmd/cloud/index.ts` - add option
- `src/cmd/cloud/deploy.ts` - implement dry-run logic

**Implementation:**
- Add `.option('--dry-run', 'Show what would be deployed without uploading')`
- In `deployCommand()`:
  - Still run build (unless --no-build)
  - Still create zip to get stats
  - Print summary but skip upload
  - Print "Dry run - no files uploaded"

**Output:**
```
Using project configuration from .scratch/project.toml
  name:      my-site
  namespace: global

Building project...
Building Scratch project in .
Built 42 files (256.3 KB) in 1234ms
Zipping dist/...
  42 files, 256.3 KB -> 64.2 KB

Dry run complete. Would deploy to:
  https://pages.scratch.wiki/_/my-site
```

---

## Implementation Order

1. **Helpers first** (low risk, enable other changes):
   - `stripTrailingSlash()` in util.ts
   - `formatNamespace()` in cloud/namespace.ts
   - Update `formatDateTime()` with timezone

2. **Display consistency** (isolated changes):
   - Trailing slashes on URLs
   - Namespace display
   - Verify tree indentation

3. **Build improvements** (more complex):
   - Build progress output
   - Build file count and size

4. **Deploy improvements**:
   - Unzipped + zipped size display
   - --dry-run flag

5. **Prompt audit** (final polish):
   - Review all prompts for consistency

---

## Testing

For each change:
1. Run the affected command manually
2. Verify output matches expected format
3. Test edge cases (empty projects, errors, etc.)

Commands to test:
```bash
# Build
bun run src/index.ts build /tmp/test-scratch

# Deploy dry-run
bun run src/index.ts cloud deploy --dry-run /tmp/test-scratch

# Create
rm -rf /tmp/test-scratch && bun run src/index.ts create /tmp/test-scratch

# Checkout
cd /tmp/test-scratch && bun run src/index.ts checkout --list

# Cloud commands (need auth)
bun run src/index.ts cloud whoami
bun run src/index.ts cloud projects list
```
