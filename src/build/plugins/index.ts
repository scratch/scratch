/**
 * Build plugins for MDX preprocessing and compilation.
 *
 * This module exports all remark, rehype, and Bun plugins used during the build,
 * along with a unified reset function for clearing plugin state between builds.
 */

// Remark plugins (operate on MDAST - markdown AST)
export {
  createAutoImportPlugin,
  getPreprocessingErrors,
  checkDefaultExport,
  type ComponentMap,
  resetAutoImportState,
} from './remark-auto-import';

export { createNotProsePlugin } from './remark-not-prose';

export { createFrontmatterPlugin } from './remark-frontmatter';

// Rehype plugins (operate on HAST - HTML AST)
export { createFootnotesPlugin } from './rehype-footnotes';

export {
  createShikiPlugin,
  detectLanguagesFromFiles,
  getLanguagesForMode,
  POPULAR_LANGUAGES,
  resetShikiState,
} from './rehype-shiki';

export { createImagePathsPlugin } from './rehype-image-paths';

// Bun plugins (for Bun.build())
export { createPackageResolverPlugin } from './bun-package-resolver';

// Import reset functions for consolidated reset
import { resetAutoImportState } from './remark-auto-import';
import { resetShikiState } from './rehype-shiki';

/**
 * Reset all plugin state for a new build.
 * This clears caches and resets any accumulated state from previous builds.
 */
export function resetPluginState(): void {
  resetAutoImportState();
  resetShikiState();
}
