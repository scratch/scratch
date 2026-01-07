import fs from 'fs/promises';
import path from 'path';
import type { BuildContext } from '../context';
import type { BuildStep, BuildPipelineState } from '../types';
import log from '../../logger';

/**
 * Recursively count files and total size in a directory.
 */
async function getDirectoryStats(dir: string): Promise<{ fileCount: number; totalBytes: number }> {
  let fileCount = 0;
  let totalBytes = 0;

  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        fileCount++;
        const stat = await fs.stat(fullPath);
        totalBytes += stat.size;
      }
    }
  }

  await walk(dir);
  return { fileCount, totalBytes };
}

export const copyToDistStep: BuildStep = {
  name: '10-copy-to-dist',
  description: 'Copy compiled assets to dist/',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    await fs.cp(ctx.clientCompiledDir, ctx.buildDir, { recursive: true });

    // Collect stats on the final output
    const stats = await getDirectoryStats(ctx.buildDir);
    state.outputs.buildStats = stats;

    log.debug(`  Output in: ${ctx.buildDir}`);
  },
};
