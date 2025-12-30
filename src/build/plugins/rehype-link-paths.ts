/**
 * Rehype plugin that transforms internal link paths to include the base path.
 *
 * - Only transforms absolute internal links (starting with /)
 * - Prepends the base path for subdirectory deployments
 * - Skips external URLs, anchors, mailto, tel, and other special protocols
 * - Handles both HAST elements (from raw HTML) and MDX JSX elements
 */
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import type { BuildContext } from '../context';
import { normalizeBase, isInternalAbsolutePath } from '../util';
import log from '../../logger';

/**
 * Get the href attribute from an MDX JSX element's attributes array.
 */
function getJsxHref(attributes: any[]): string | null {
  if (!attributes) return null;
  for (const attr of attributes) {
    if (attr.type === 'mdxJsxAttribute' && attr.name === 'href') {
      return typeof attr.value === 'string' ? attr.value : null;
    }
  }
  return null;
}

/**
 * Set the href attribute on an MDX JSX element's attributes array.
 */
function setJsxHref(attributes: any[], newHref: string): void {
  for (const attr of attributes) {
    if (attr.type === 'mdxJsxAttribute' && attr.name === 'href') {
      attr.value = newHref;
      return;
    }
  }
}

/**
 * Create a rehype plugin that transforms internal link paths to include base path.
 */
export function createLinkPathsPlugin(ctx: BuildContext): Plugin {
  const base = normalizeBase(ctx.options.base);

  // If no base path, return a no-op plugin
  if (!base) {
    return () => () => {};
  }

  return () => {
    return (tree: any) => {
      /**
       * Transform an internal href to include the base path.
       */
      function transformHref(href: string): string | null {
        if (!href || typeof href !== 'string') return null;
        if (!isInternalAbsolutePath(href)) return null;

        // Prepend base path
        const newHref = base + href;
        log.debug(`  - link: ${href} -> ${newHref}`);
        return newHref;
      }

      // Handle HAST element nodes (from raw HTML via rehype-raw)
      visit(tree, 'element', (node: any) => {
        if (node.tagName !== 'a') return;

        const props = node.properties || {};
        const href = props.href;
        const newHref = transformHref(href);
        if (newHref) {
          node.properties.href = newHref;
        }
      });

      // Handle MDX JSX elements (from markdown [text](url) syntax)
      visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node: any) => {
        if (node.name !== 'a') return;

        const href = getJsxHref(node.attributes);
        if (!href) return;

        const newHref = transformHref(href);
        if (newHref) {
          setJsxHref(node.attributes, newHref);
        }
      });
    };
  };
}
