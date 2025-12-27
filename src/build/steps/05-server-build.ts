import type { BuildContext } from '../context';
import type { BuildPipelineState } from '../types';
import type { BuildStep } from '../types';
import { getServerBunBuildConfig } from '../buncfg';
import { runBunBuild } from '../bundler';
import log from '../../logger';

export const serverBuildStep: BuildStep = {
  name: '05-server-build',
  description: 'Server Bun.build for SSG',

  shouldRun(_ctx: BuildContext, state: BuildPipelineState): boolean {
    return state.options.ssg === true && state.outputs.serverEntryPts !== null;
  },

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const serverEntryPts = state.outputs.serverEntryPts!;

    const buildConfig = await getServerBunBuildConfig(ctx, {
      entryPts: Object.values(serverEntryPts),
      outDir: ctx.serverCompiledDir,
      root: ctx.serverSrcDir,
    });

    const buildResult = await runBunBuild(buildConfig, 'Server');

    log.debug(`  Built ${buildResult.outputs.length} server modules`);

    state.outputs.serverBuildResult = buildResult;
  },
};
