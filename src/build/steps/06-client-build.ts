import path from 'path';
import type { BuildContext } from '../context';
import type { BuildPipelineState, ClientBuildOutput } from '../types';
import { BuildPhase, defineStep } from '../types';
import { getBunBuildConfig } from '../buncfg';
import { getPreprocessingErrors } from '../preprocess';
import log from '../../logger';

export const clientBuildStep = defineStep<ClientBuildOutput>({
  name: '06-client-build',
  description: 'Client Bun.build',
  phase: BuildPhase.ClientBuild,

  shouldRun(): boolean {
    return true;
  },

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<ClientBuildOutput> {
    const clientEntryPts = state.outputs.clientEntryPts!;

    // Prepare build config
    const buildConfig = await getBunBuildConfig({
      entryPts: Object.values(clientEntryPts),
      outDir: ctx.clientCompiledDir,
      root: ctx.clientSrcDir,
    });

    // Run client build
    let buildResult: Awaited<ReturnType<typeof Bun.build>>;
    try {
      buildResult = await Bun.build(buildConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Client bundle failed: ${errorMessage}`);
    }

    // Check build result
    if (!buildResult.success) {
      const errorMessages = buildResult.logs.map((msg) => String(msg)).join('\n');
      throw new Error(`Client build failed:\n${errorMessages}`);
    }

    // Check for preprocessing errors
    const preprocessErrors = getPreprocessingErrors();
    if (preprocessErrors.length > 0) {
      for (const err of preprocessErrors) {
        log.error(err.message);
      }
      throw new Error('MDX preprocessing failed');
    }

    log.debug(`  Built ${buildResult.outputs.length} client bundles`);

    // Build JS output map
    const jsOutputMap = buildJsOutputMap(ctx, clientEntryPts, buildResult);

    return { buildResult, jsOutputMap };
  },
});

/**
 * Build map from entry name to hashed JS output path
 */
function buildJsOutputMap(
  ctx: BuildContext,
  clientEntryPts: Record<string, string>,
  result: Awaited<ReturnType<typeof Bun.build>>
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
