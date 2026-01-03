# Fix: Auto-correct Relative Markdown Links with Extensions

## Problem

When users write relative links to other markdown files like `[other page](file.md)`, the generated links break because the actual route is `/file` not `/file.md`.

## Solution

Create a new **remark plugin** that:
1. Detects relative links ending in `.md` or `.mdx`
2. Strips the extension to produce the correct route
3. Logs a warning for auditability

## Files to Create/Modify

1. **Create**: `src/build/plugins/remark-link-extensions.ts` - New remark plugin
2. **Modify**: `src/build/plugins/index.ts` - Export the new plugin
3. **Modify**: `src/build/buncfg.ts` - Add plugin to remarkPlugins array

## Implementation

### 1. Create `src/build/plugins/remark-link-extensions.ts`

```typescript
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import type { Link } from 'mdast';
import log from '../../logger';

/**
 * Remark plugin that detects and corrects relative markdown links.
 *
 * Transforms: [text](file.md) -> [text](file)
 * Logs a warning for each corrected link.
 */
export function createLinkExtensionsPlugin(): Plugin {
  return () => {
    return (tree: any) => {
      visit(tree, 'link', (node: Link) => {
        const url = node.url;
        if (!url || typeof url !== 'string') return;

        // Only fix relative links (not absolute URLs or anchors)
        if (url.startsWith('http://') || url.startsWith('https://') ||
            url.startsWith('/') || url.startsWith('#') ||
            url.startsWith('mailto:') || url.startsWith('tel:')) {
          return;
        }

        // Check for .md or .mdx extension
        const match = url.match(/^(.+)\.(md|mdx)$/);
        if (match) {
          const newUrl = match[1];
          log.info(`Link corrected: ${url} -> ${newUrl}`);
          node.url = newUrl;
        }
      });
    };
  };
}
```

### 2. Update `src/build/plugins/index.ts`

Add export:
```typescript
export { createLinkExtensionsPlugin } from './remark-link-extensions';
```

### 3. Update `src/build/buncfg.ts`

Import the plugin and add to remarkPlugins array (after `remarkFrontmatter`, before other plugins):

```typescript
import { createLinkExtensionsPlugin } from './plugins';

// In createMdxBuildPlugin():
const remarkPlugins: any[] = [
  remarkGfm,
  remarkFrontmatter,
  createLinkExtensionsPlugin(),  // <-- Add here
  // ... rest of plugins
];
```

## Log Output

When a user has `[click here](about.md)` in their markdown:
```
Link corrected: about.md -> about
```

## Testing

```bash
# Create test project
rm -rf /tmp/test-links && mkdir -p /tmp/test-links/pages
cd /tmp/test-links
bun run ~/git/scratch/scratch/src/index.ts create .

# Create pages with relative md links
echo '# Home
[Go to about](about.md)
[Nested link](docs/guide.mdx)' > pages/index.mdx

echo '# About' > pages/about.md

# Build and verify warnings are logged
bun run ~/git/scratch/scratch/src/index.ts build .
# Should see: "Link corrected: about.md -> about"
# Should see: "Link corrected: docs/guide.mdx -> docs/guide"
```

## Edge Cases Handled

- `about.md` → `about` (simple relative)
- `../other.md` → `../other` (parent directory)
- `docs/guide.mdx` → `docs/guide` (nested path)
- `https://example.com/file.md` → unchanged (external URL)
- `/absolute/path.md` → unchanged (absolute path, handled elsewhere)
- `#section` → unchanged (anchor only)
