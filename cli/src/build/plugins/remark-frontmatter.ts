/**
 * Remark plugin that extracts frontmatter and stores it for later HTML injection.
 *
 * This runs during MDX compilation and stores frontmatter data on the entry
 * for later use by the inject-frontmatter build step.
 */
import matter from 'gray-matter';
import { realpathSync } from 'fs';
import type { VFile } from 'vfile';
import type { BuildContext } from '../context';

/**
 * Create a remark plugin that extracts frontmatter and stores it on the entry.
 */
export function createFrontmatterPlugin(ctx: BuildContext) {
  return () => {
    return async (tree: unknown, file: VFile) => {
      if (!file.path) return;

      const code = await Bun.file(file.path).text();
      const extracted = matter(code);

      // Store frontmatter for later HTML injection
      // Match by entry absPath (resolve symlinks for comparison on macOS)
      const entries = await ctx.getEntries();
      const realFilePath = realpathSync(file.path);

      for (const entry of Object.values(entries)) {
        try {
          const realEntryPath = realpathSync(entry.absPath);
          if (realFilePath === realEntryPath) {
            entry.frontmatterData = extracted.data;
            break;
          }
        } catch {
          // Entry file might not exist, skip
        }
      }
    };
  };
}
