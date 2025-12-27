import fs from 'fs/promises';
import type { BuildContext } from '../../context';
import type { BuildPipelineState } from '../types';
import { BuildPhase, defineStep } from '../types';
import log from '../../logger';

export const copyPagesStaticStep = defineStep({
  name: '09-copy-pages-static',
  description: 'Copy pages/ as static assets',
  phase: BuildPhase.CopyPagesStatic,

  shouldRun(_ctx: BuildContext, state: BuildPipelineState): boolean {
    // Skip if static mode is 'public' (don't copy pages/)
    return state.options.static !== 'public';
  },

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    log.debug('=== PAGES STATIC ASSETS ===');

    const staticMode = state.options.static ?? 'assets';
    const buildFileExts = ['.md', '.mdx', '.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs'];

    // Resolve symlinks to avoid fs.cp issues when pagesDir is a symlink (e.g., in view mode)
    const realPagesDir = await fs.realpath(ctx.pagesDir);
    await fs.cp(realPagesDir, ctx.buildDir, {
      recursive: true,
      filter: (src) => {
        if (staticMode === 'all') return true;
        // 'assets' mode: skip build files
        return !buildFileExts.some((ext) => src.endsWith(ext));
      },
    });

    log.debug(`  Copied pages/ static assets (mode: ${staticMode})`);
  },
});
