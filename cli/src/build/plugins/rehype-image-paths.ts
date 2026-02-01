/**
 * Rehype plugin that transforms relative image paths to absolute static routes.
 *
 * - Resolves paths relative to the MDX file's location within pages/
 * - Prepends the base path for subdirectory deployments
 * - Handles both markdown images (converted to img by MDX) and HTML img tags
 */
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import path from 'path';
import type { BuildContext } from '../context';
import { normalizeBase, isInternalAbsolutePath, isRelativePath } from '../util';
import log from '../../logger';

export interface ImagePathsPluginOptions {
  /** Base path for deployment (e.g., '/mysite') */
  base?: string;
  /** The pages directory path */
  pagesDir: string;
}

/**
 * Get the src attribute from an MDX JSX element's attributes array.
 */
function getJsxSrc(attributes: any[]): string | null {
  if (!attributes) return null;
  for (const attr of attributes) {
    if (attr.type === 'mdxJsxAttribute' && attr.name === 'src') {
      return typeof attr.value === 'string' ? attr.value : null;
    }
  }
  return null;
}

/**
 * Set the src attribute on an MDX JSX element's attributes array.
 */
function setJsxSrc(attributes: any[], newSrc: string): void {
  for (const attr of attributes) {
    if (attr.type === 'mdxJsxAttribute' && attr.name === 'src') {
      attr.value = newSrc;
      return;
    }
  }
}

/**
 * Create a rehype plugin that transforms relative image paths to absolute static routes.
 */
export function createImagePathsPlugin(ctx: BuildContext): Plugin {
  const base = normalizeBase(ctx.options.base);
  const pagesDir = ctx.pagesDir;

  return () => {
    return (tree: any, file: any) => {
      // Get the directory of the current MDX file relative to pages/
      let fileDir = '';
      if (file && file.path) {
        const absFilePath = path.resolve(file.path);
        // Get the directory containing the MDX file
        const absFileDir = path.dirname(absFilePath);
        // Get relative path from pages directory
        if (absFileDir.startsWith(pagesDir)) {
          fileDir = absFileDir.slice(pagesDir.length);
          // Normalize: remove leading slash if present
          if (fileDir.startsWith('/') || fileDir.startsWith(path.sep)) {
            fileDir = fileDir.slice(1);
          }
        }
      }

      /**
       * Transform an image src path to include the base path.
       * Handles both relative paths and absolute internal paths.
       */
      function transformSrc(src: string): string | null {
        if (!src || typeof src !== 'string') return null;

        // Handle relative paths: resolve relative to MDX file, then prepend base
        if (isRelativePath(src)) {
          // Resolve the relative path from the MDX file's directory
          // e.g., ./photo.png in pages/blog/post.mdx -> blog/photo.png
          // e.g., ../images/logo.svg in pages/blog/post.mdx -> images/logo.svg
          const resolvedPath = path.posix.normalize(
            path.posix.join(fileDir.replace(/\\/g, '/'), src)
          );

          // Build the final absolute path with base
          const absolutePath = base + '/' + resolvedPath;
          log.debug(`  - image: ${src} -> ${absolutePath}`);
          return absolutePath;
        }

        // Handle absolute internal paths: prepend base
        if (base && isInternalAbsolutePath(src)) {
          const newSrc = base + src;
          log.debug(`  - image: ${src} -> ${newSrc}`);
          return newSrc;
        }

        return null;
      }

      // Handle HAST element nodes (from raw HTML via rehype-raw)
      visit(tree, 'element', (node: any) => {
        if (node.tagName !== 'img') return;

        const props = node.properties || {};
        const src = props.src;
        const newSrc = transformSrc(src);
        if (newSrc) {
          node.properties.src = newSrc;
        }
      });

      // Handle MDX JSX elements (from markdown ![alt](src) syntax)
      visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node: any) => {
        if (node.name !== 'img') return;

        const src = getJsxSrc(node.attributes);
        if (!src) return;

        const newSrc = transformSrc(src);
        if (newSrc) {
          setJsxSrc(node.attributes, newSrc);
        }
      });
    };
  };
}
