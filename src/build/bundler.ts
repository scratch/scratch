import { getPreprocessingErrors } from './preprocess';
import log from '../logger';

export type BunBuildResult = Awaited<ReturnType<typeof Bun.build>>;

/**
 * Run Bun.build with unified error handling for both server and client builds.
 * Checks build success and preprocessing errors.
 */
export async function runBunBuild(
  config: Parameters<typeof Bun.build>[0],
  type: 'Server' | 'Client'
): Promise<BunBuildResult> {
  // Run build
  let buildResult: BunBuildResult;
  try {
    buildResult = await Bun.build(config);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${type} bundle failed: ${errorMessage}`);
  }

  // Check build result
  if (!buildResult.success) {
    const errorMessages = buildResult.logs.map((msg) => String(msg)).join('\n');
    throw new Error(`${type} build failed:\n${errorMessages}`);
  }

  // Check for preprocessing errors
  const preprocessErrors = getPreprocessingErrors();
  if (preprocessErrors.length > 0) {
    for (const err of preprocessErrors) {
      log.error(err.message);
    }
    throw new Error('MDX preprocessing failed');
  }

  return buildResult;
}
