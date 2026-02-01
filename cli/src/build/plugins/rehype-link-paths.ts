/**
 * Rehype plugin that transforms internal link paths:
 *
 * - Strips .md/.mdx extensions from relative links (e.g., about.md -> about)
 * - Prepends the base path for absolute internal links (when base is set)
 * - Skips external URLs, anchors, mailto, tel, and other special protocols
 * - Handles HAST elements (from markdown links) and MDX JSX elements (from raw <a> in MDX)
 */
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import type { BuildContext } from '../context';
import { normalizeBase, isInternalAbsolutePath, isRelativePath } from '../util';
import log from '../../logger';

/**
 * Transform a link href - returns new value or null if no change needed.
 */
function transformLinkHref(href: string, base: string): string | null {
  if (!href || typeof href !== 'string') return null;

  // Strip .md/.mdx extension from relative paths
  if (isRelativePath(href)) {
    if (href.endsWith('.md')) {
      const newHref = href.slice(0, -3);
      log.debug(`  - link: ${href} -> ${newHref} (stripped extension)`);
      return newHref;
    }
    if (href.endsWith('.mdx')) {
      const newHref = href.slice(0, -4);
      log.debug(`  - link: ${href} -> ${newHref} (stripped extension)`);
      return newHref;
    }
  }

  // Prepend base path to absolute internal paths (only when base is set)
  if (base && isInternalAbsolutePath(href)) {
    const newHref = base + href;
    log.debug(`  - link: ${href} -> ${newHref}`);
    return newHref;
  }

  return null;
}

/**
 * Create a rehype plugin that transforms internal link paths.
 */
export function createLinkPathsPlugin(ctx: BuildContext): Plugin {
  const base = normalizeBase(ctx.options.base);

  return () => {
    return (tree: any) => {
      // Handle HAST element nodes (from markdown links after remark-rehype)
      visit(tree, 'element', (node: any) => {
        if (node.tagName !== 'a') return;

        const props = node.properties || {};
        const href = props.href;
        const newHref = transformLinkHref(href, base);
        if (newHref !== null) {
          node.properties.href = newHref;
        }
      });

      // Handle MDX JSX elements (from raw <a> tags in MDX files)
      visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node: any) => {
        if (node.name !== 'a') return;

        const attrs = node.attributes || [];
        for (const attr of attrs) {
          if (attr.type === 'mdxJsxAttribute' && attr.name === 'href') {
            const href = typeof attr.value === 'string' ? attr.value : null;
            if (href) {
              const newHref = transformLinkHref(href, base);
              if (newHref !== null) {
                attr.value = newHref;
              }
            }
            break;
          }
        }
      });
    };
  };
}
