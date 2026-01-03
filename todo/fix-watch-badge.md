# Fix: ScratchBadge logo not loading in watch mode

## Problem

When using `scratch watch <file>`, the ScratchBadge component shows a broken image because `/scratch-logo.svg` is not available.

**Root Cause:** In `src/cmd/watch.ts:61`, the temp project is created with `example: false`:
```typescript
await createCommand(tempDir, { src: true, package: true, example: false, quiet: true });
```

With `example: false`, `src/template.ts` lines 117-122 skip copying `public/*` files:
```typescript
if (!includeExample && (relativePath.startsWith('pages/') || relativePath.startsWith('public/'))) {
  continue;
}
```

However, the ScratchBadge component (included via `src: true`) references `/scratch-logo.svg`:
```jsx
<img src="/scratch-logo.svg" alt="Scratch" className="h-13 pb-1" />
```

This creates a broken image link because `public/scratch-logo.svg` was skipped.

## Solution

Include `public/scratch-logo.svg` and `public/favicon.svg` as core infrastructure rather than example content, since they're required by the default template components.

**File to modify:** `src/template.ts`

**Change:** Update `MINIMAL_FILES` set to include the required public assets:

```typescript
const MINIMAL_FILES = new Set([
  '.gitignore',
  'AGENTS.md',
  'pages/index.mdx',
  'public/favicon.svg',       // Required for browser tab icon
  'public/scratch-logo.svg',  // Required by ScratchBadge component
]);
```

This ensures these files are always included, even with `includeExample: false`.

## Files

- `src/template.ts:27` - Add `public/favicon.svg` and `public/scratch-logo.svg` to `MINIMAL_FILES`

## Testing

1. Run `scratch watch test.md` on a simple markdown file
2. Verify the ScratchBadge logo renders correctly in the footer
3. Verify the favicon appears in the browser tab
