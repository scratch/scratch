import { getPreprocessingErrors } from './plugins';
import log from '../logger';
import type { BunBuildResult } from './types';

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
  } catch (error: any) {
    // Bun.build() throws an AggregateError with individual errors in the 'errors' array.
    // Each error has position info we need to format nicely.
    let details = error.message || 'Unknown error';
    if (error.errors && Array.isArray(error.errors)) {
      details = error.errors
        .map((e: any) => {
          // BuildMessage/ResolveMessage have: message, position (file, line, column, lineText)
          if (e.position) {
            const pos = e.position;
            const location = pos.file ? `${pos.file}:${pos.line}:${pos.column}` : '';
            const linePreview = pos.lineText ? `\n  ${pos.line} | ${pos.lineText}` : '';
            return `${e.message}${location ? `\n  at ${location}` : ''}${linePreview}`;
          }
          return String(e);
        })
        .join('\n\n');
    }
    throw new Error(`${type} bundle failed:\n${details}`);
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
