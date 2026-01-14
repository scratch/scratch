import path from 'path';
import type { BuildContext } from '../context';
import type { BuildPipelineState, BuildStep } from '../types';
import { getBunBuildConfig } from '../buncfg';
import { runBunBuild, type BunBuildResult } from '../bundler';
import log from '../../logger';

export const clientBuildStep: BuildStep = {
  name: '06-client-build',
  description: 'Client Bun.build',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const clientEntryPts = state.outputs.clientEntryPts!;

    const buildConfig = await getBunBuildConfig(ctx, {
      entryPts: Object.values(clientEntryPts),
      outDir: ctx.clientCompiledDir,
      root: ctx.clientSrcDir,
    });

    const buildResult = await runBunBuild(buildConfig, 'Client');

    log.debug(`  Built ${buildResult.outputs.length} client bundles`);

    // Build JS output map and store outputs
    state.outputs.clientBuildResult = buildResult;
    state.outputs.jsOutputMap = buildJsOutputMap(ctx, clientEntryPts, buildResult);
  },
};

/**
 * Build map from entry name to hashed JS output path
 */
function buildJsOutputMap(
  ctx: BuildContext,
  clientEntryPts: Record<string, string>,
  result: BunBuildResult
): Record<string, string> {
  const jsOutputMap: Record<string, string> = {};

  // Build reverse map: relative base path (without extension) -> entry name
  const basePathToEntry: Record<string, string> = {};
  for (const [entryName, tsxPath] of Object.entries(clientEntryPts)) {
    const relativeTsx = path.relative(ctx.clientSrcDir, tsxPath);
    const basePath = relativeTsx.replace(/\.tsx$/, '');
    basePathToEntry[basePath] = entryName;
  }

  for (const output of result.outputs) {
    log.debug(`  ${path.relative(ctx.rootDir, output.path)}`);

    // Only process JS entry files (not chunks)
    if (output.kind === 'entry-point' && output.path.endsWith('.js')) {
      const relativePath = path.relative(ctx.clientCompiledDir, output.path);
      const dir = path.dirname(relativePath);
      const basename = path.basename(relativePath, '.js');
      const nameWithoutHash = basename.replace(/-[a-z0-9]+$/, '');

      const basePath = dir === '.' ? nameWithoutHash : path.join(dir, nameWithoutHash);
      const entryName = basePathToEntry[basePath];

      if (entryName) {
        jsOutputMap[entryName] = output.path;
      }
    }
  }

  return jsOutputMap;
}
