import type { BuildContext } from '../build/context';
import { runBuildPipeline, formatBuildError } from '../build';
import type { BuildOptions } from '../build';
import log from '../logger';

export type { BuildOptions };

export interface BuildResult {
  fileCount?: number;
  totalBytes?: number;
}

/**
 * Build the project using the modular build pipeline
 */
export async function buildCommand(ctx: BuildContext, options: BuildOptions = {}, projectPath?: string): Promise<BuildResult> {
  const { ssg = false } = options;

  try {
    // Note: "Building..." message is printed AFTER dependencies step
    // to avoid duplicate output when build restarts in subprocess
    log.info('Building Scratch project in', projectPath || '.');
    log.debug(`Building with Bun${ssg ? ' (SSG)' : ''}...`);

    const state = await runBuildPipeline(ctx, options);
    return {
      fileCount: state.outputs.buildStats?.fileCount,
      totalBytes: state.outputs.buildStats?.totalBytes,
    };
  } catch (error) {
    const formatted = formatBuildError(error as Error);
    throw new Error(formatted);
  }
}
