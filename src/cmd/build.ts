import type { BuildContext } from '../build/context';
import { runBuildPipeline, formatBuildError } from '../build';
import type { BuildOptions } from '../build';
import log from '../logger';

export type { BuildOptions };

/**
 * Build the project using the modular build pipeline
 */
export async function buildCommand(ctx: BuildContext, options: BuildOptions = {}, projectPath?: string) {
  const { ssg = false } = options;

  try {
    // Note: "Building..." message is printed AFTER dependencies step
    // to avoid duplicate output when build restarts in subprocess
    log.info('Building Scratch project in', projectPath || '.');
    log.debug(`Building with Bun${ssg ? ' (SSG)' : ''}...`);

    await runBuildPipeline(ctx, options);
  } catch (error) {
    const formatted = formatBuildError(error as Error);
    throw new Error(formatted);
  }
}
