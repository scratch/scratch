import fs from 'fs/promises';
import path from 'path';
import type { BuildContext } from '../context';
import type { BuildPipelineState, BuildStep } from '../types';
import log from '../../logger';

// Extensions to exclude from pages/ static copying (executable code files)
const CODE_FILE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

/**
 * Copy static files from pages/ directory to build directory.
 * - Copies everything EXCEPT .js, .jsx, .ts, .tsx, .mjs, .cjs
 * - Renames .mdx files to .md when copying
 */
async function copyPagesStatic(pagesDir: string, buildDir: string): Promise<void> {
  // Resolve symlinks to avoid issues when pagesDir is a symlink (e.g., in view mode)
  const realPagesDir = await fs.realpath(pagesDir);

  async function processDir(srcDir: string, destDir: string): Promise<void> {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      let destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        await fs.mkdir(destPath, { recursive: true });
        await processDir(srcPath, destPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Skip code files
        if (CODE_FILE_EXTS.includes(ext)) {
          continue;
        }

        // Rename .mdx to .md
        if (ext === '.mdx') {
          const newName = entry.name.slice(0, -4) + '.md';
          destPath = path.join(destDir, newName);
        }

        // Ensure destination directory exists
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        // Copy the file
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  if (await fs.exists(realPagesDir)) {
    await processDir(realPagesDir, buildDir);
  }
}

export const copyStaticStep: BuildStep = {
  name: '09-copy-static',
  description: 'Copy static assets',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    // Copy pages/ static assets (with .mdx → .md rename)
    await copyPagesStatic(ctx.pagesDir, ctx.buildDir);
    log.debug('  Copied pages/ static assets');

    // Copy public/ static assets
    if (await fs.exists(ctx.staticDir)) {
      await fs.cp(ctx.staticDir, ctx.buildDir, { recursive: true });
      log.debug('  Copied public/ static assets');
    }
  },
};
