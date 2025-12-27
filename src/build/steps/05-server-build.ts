import type { BuildContext } from '../context';
import type { BuildPipelineState, ServerBuildOutput } from '../types';
import { BuildPhase, defineStep } from '../types';
import { getServerBunBuildConfig } from '../buncfg';
import { getPreprocessingErrors } from '../preprocess';
import log from '../../logger';

export const serverBuildStep = defineStep<ServerBuildOutput>({
  name: '05-server-build',
  description: 'Server Bun.build for SSG',
  phase: BuildPhase.ServerBuild,

  shouldRun(_ctx: BuildContext, state: BuildPipelineState): boolean {
    return state.options.ssg === true && state.outputs.serverEntryPts !== null;
  },

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<ServerBuildOutput> {
    log.debug('=== SERVER BUILD ===');

    const serverEntryPts = state.outputs.serverEntryPts!;

    // Prepare build config
    const buildConfig = await getServerBunBuildConfig({
      entryPts: Object.values(serverEntryPts),
      outDir: ctx.serverCompiledDir,
      root: ctx.serverSrcDir,
    });

    // Run server build
    let buildResult: Awaited<ReturnType<typeof Bun.build>>;
    try {
      buildResult = await Bun.build(buildConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Server bundle failed: ${errorMessage}`);
    }

    // Check build result
    if (!buildResult.success) {
      const errorMessages = buildResult.logs.map((msg) => String(msg)).join('\n');
      throw new Error(`Server build failed:\n${errorMessages}`);
    }

    log.debug(`  Built ${buildResult.outputs.length} server modules`);

    // Check for preprocessing errors
    const preprocessErrors = getPreprocessingErrors();
    if (preprocessErrors.length > 0) {
      for (const err of preprocessErrors) {
        log.error(err.message);
      }
      throw new Error('MDX preprocessing failed');
    }

    return { buildResult };
  },
});
