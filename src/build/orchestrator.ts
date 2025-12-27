import type { BuildContext } from './context';
import type {
  BuildOptions,
  BuildPipelineState,
  BuildStep,
  TsxEntriesOutput,
  TailwindOutput,
  ServerBuildOutput,
  ClientBuildOutput,
  RenderServerOutput,
} from './types';
import { BuildPhase } from './types';
import { formatBuildError } from './errors';
import { resetPreprocessingState } from './preprocess';
import { resetLanguageCache } from './buncfg';
import log from '../logger';

// Import all steps
import {
  ensureDependenciesStep,
  resetDirectoriesStep,
  createTsxEntriesStep,
  tailwindCssStep,
  serverBuildStep,
  renderServerStep,
  clientBuildStep,
  generateHtmlStep,
  injectFrontmatterStep,
  copyPagesStaticStep,
  copyPublicStaticStep,
  copyToDistStep,
} from './steps';

/**
 * Ordered list of all build steps.
 * The orchestrator executes these in sequence.
 */
const BUILD_STEPS: BuildStep<any>[] = [
  ensureDependenciesStep,
  resetDirectoriesStep,
  createTsxEntriesStep,
  tailwindCssStep,
  serverBuildStep,
  renderServerStep,
  clientBuildStep,
  generateHtmlStep,
  injectFrontmatterStep,
  copyPagesStaticStep,
  copyPublicStaticStep,
  copyToDistStep,
];

/**
 * Create initial pipeline state
 */
function createInitialState(options: BuildOptions): BuildPipelineState {
  return {
    phase: BuildPhase.NotStarted,
    options,
    outputs: {},
    timings: {},
  };
}

/**
 * Execute a single step with timing
 */
async function executeStep<T>(
  step: BuildStep<T>,
  ctx: BuildContext,
  state: BuildPipelineState
): Promise<{ data: T; durationMs: number }> {
  const start = performance.now();
  state.phase = step.phase;
  const data = await step.execute(ctx, state);
  const durationMs = performance.now() - start;
  state.timings[step.name] = durationMs;
  return { data, durationMs };
}

/**
 * Store step-specific output in the pipeline state
 */
function storeStepOutput(step: BuildStep<any>, data: any, state: BuildPipelineState): void {
  if (!data) return;

  switch (step.name) {
    case '03-create-tsx-entries': {
      const output = data as TsxEntriesOutput;
      state.outputs.entries = output.entries;
      state.outputs.clientEntryPts = output.clientEntryPts;
      state.outputs.serverEntryPts = output.serverEntryPts;
      break;
    }
    case '04-tailwind-css': {
      const output = data as TailwindOutput;
      state.outputs.cssFilename = output.cssFilename;
      break;
    }
    case '05-server-build': {
      const output = data as ServerBuildOutput;
      state.outputs.serverBuildResult = output.buildResult;
      break;
    }
    case '05b-render-server': {
      const output = data as RenderServerOutput;
      state.outputs.renderedContent = output.renderedContent;
      break;
    }
    case '06-client-build': {
      const output = data as ClientBuildOutput;
      state.outputs.clientBuildResult = output.buildResult;
      state.outputs.jsOutputMap = output.jsOutputMap;
      break;
    }
  }
}

/**
 * Main build orchestrator - executes steps in sequence with fail-fast behavior
 */
export async function runBuildPipeline(
  ctx: BuildContext,
  options: BuildOptions = {}
): Promise<BuildPipelineState> {
  const state = createInitialState(options);

  // Reset global state from any previous builds
  resetPreprocessingState();
  resetLanguageCache();

  // Execute steps in order
  for (let i = 0; i < BUILD_STEPS.length; i++) {
    const step = BUILD_STEPS[i];

    // Check if step should run
    if (!step.shouldRun(ctx, state)) {
      log.debug(`Skipping step: ${step.description}`);
      continue;
    }

    // Handle parallel execution for tailwind + server build
    if (step.name === '04-tailwind-css') {
      const serverStep = BUILD_STEPS[i + 1]; // 05-server-build

      if (serverStep && serverStep.shouldRun(ctx, state)) {
        // Run tailwind and server build in parallel
        log.debug(`Running parallel: ${step.description} + ${serverStep.description}`);

        try {
          const [tailwindResult, serverResult] = await Promise.all([
            executeStep(step, ctx, state),
            executeStep(serverStep, ctx, state),
          ]);

          // Store outputs
          storeStepOutput(step, tailwindResult.data, state);
          storeStepOutput(serverStep, serverResult.data, state);

          // Skip the server build step in the main loop
          i++;
          continue;
        } catch (error) {
          state.phase = BuildPhase.Failed;
          state.error = error instanceof Error ? error : new Error(String(error));
          state.failedStep = step.name;
          throw new Error(formatBuildError(state.error));
        }
      }
    }

    // Sequential execution
    try {
      const result = await executeStep(step, ctx, state);
      storeStepOutput(step, result.data, state);
    } catch (error) {
      // Fail fast - stop on first error
      state.phase = BuildPhase.Failed;
      state.error = error instanceof Error ? error : new Error(String(error));
      state.failedStep = step.name;
      throw new Error(formatBuildError(state.error));
    }
  }

  state.phase = BuildPhase.Completed;

  // Print timing breakdown in debug mode
  log.debug('=== TIMING BREAKDOWN ===');
  for (const [name, ms] of Object.entries(state.timings)) {
    log.debug(`  ${name}: ${ms.toFixed(0)}ms`);
  }

  return state;
}

export { BUILD_STEPS };
