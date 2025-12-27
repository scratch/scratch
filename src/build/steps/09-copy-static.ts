import fs from 'fs/promises';
import type { BuildContext } from '../context';
import type { BuildPipelineState, BuildStep } from '../types';
import log from '../../logger';

export const copyStaticStep: BuildStep = {
  name: '09-copy-static',
  description: 'Copy static assets',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const staticMode = state.options.static ?? 'assets';

    // Copy pages/ static assets (skip if mode is 'public')
    if (staticMode !== 'public') {
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
    }

    // Copy public/ static assets
    if (await fs.exists(ctx.staticDir)) {
      await fs.cp(ctx.staticDir, ctx.buildDir, { recursive: true });
      log.debug('  Copied public/ static assets');
    }
  },
};
