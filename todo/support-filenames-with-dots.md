# Fix: Support Filenames with Dots in MDX/MD Pages

## Problem

Files like `pages/test.file.md` result in 404 errors when served via `scratch dev` or `scratch preview`.

**Root cause:** The routing logic uses `!pathname.includes('.')` to distinguish between directory routes (serve `index.html`) and file requests (serve directly). This fails for routes like `/test.file` because the dot makes it look like a file request, so the server never tries `/test.file/index.html`.

## Files to Modify

1. `src/cmd/dev.ts` (line 97)
2. `src/cmd/preview.ts` (line 34)

## Solution

Replace the flawed dot check with a proper file extension detection that only considers the **last path segment**:

**Before:**
```typescript
if (!pathname.includes('.')) {
```

**After:**
```typescript
// Check if path ends with a file extension (e.g., .html, .css, .js)
// Only the last segment matters - /test.file should still try index.html
const lastSegment = pathname.split('/').pop() || '';
const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(lastSegment) &&
                         !lastSegment.startsWith('.');

if (!hasFileExtension) {
```

This correctly handles:
- `/test.file` → no extension → try `/test.file/index.html`
- `/style.css` → has `.css` extension → serve directly
- `/.hidden` → hidden file, not extension → try `/.hidden/index.html`

## Implementation Steps

1. Add a helper function `hasFileExtension(pathname: string): boolean` to `src/util.ts` for reuse
2. Update `src/cmd/dev.ts` line 97 to use the new helper
3. Update `src/cmd/preview.ts` line 34 to use the new helper
4. Add test case for dotted filenames

## Testing

```bash
# Create test file
mkdir -p /tmp/test-dots && cd /tmp/test-dots
bun run ~/git/scratch/scratch/src/index.ts create .
echo "# Test File" > pages/test.file.md

# Test dev server
bun run ~/git/scratch/scratch/src/index.ts dev .
# Visit http://localhost:5173/test.file - should show page, not 404
```
