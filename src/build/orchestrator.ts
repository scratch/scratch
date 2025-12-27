import type { BuildContext } from './context';
import type { BuildOptions, BuildPipelineState, BuildStep } from './types';
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
  copyStaticStep,
  copyToDistStep,
} from './steps';

/**
 * Ordered list of all build steps.
 * The orchestrator executes these in sequence.
 */
const BUILD_STEPS: BuildStep[] = [
  ensureDependenciesStep,
  resetDirectoriesStep,
  createTsxEntriesStep,
  tailwindCssStep,
  serverBuildStep,
  renderServerStep,
  clientBuildStep,
  generateHtmlStep,
  injectFrontmatterStep,
  copyStaticStep,
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
 * Extract step number from step name (e.g., "03-foo" -> "03", "05b-bar" -> "05b")
 */
function getStepNumber(name: string): string {
  const match = name.match(/^(\d+[a-z]?)-/);
  return match ? match[1]! : name;
}

/**
 * Execute a single step with timing
 */
async function executeStep(
  step: BuildStep,
  ctx: BuildContext,
  state: BuildPipelineState
): Promise<void> {
  const stepNum = getStepNumber(step.name);
  log.debug(`=== [${stepNum}] ${step.description} ===`);

  const start = performance.now();
  state.phase = step.phase;
  await step.execute(ctx, state);
  state.timings[step.name] = performance.now() - start;
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
    const step = BUILD_STEPS[i]!;

    // Check if step should run (defaults to true if not defined)
    if (step.shouldRun && !step.shouldRun(ctx, state)) {
      log.debug(`Skipping step: ${step.description}`);
      continue;
    }

    // Handle parallel execution for tailwind + server build
    if (step.name === '04-tailwind-css') {
      const serverStep = BUILD_STEPS[i + 1]; // 05-server-build

      if (serverStep && (!serverStep.shouldRun || serverStep.shouldRun(ctx, state))) {
        // Run tailwind and server build in parallel
        log.debug(`Running parallel: ${step.description} + ${serverStep.description}`);

        try {
          await Promise.all([
            executeStep(step, ctx, state),
            executeStep(serverStep, ctx, state),
          ]);

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
      await executeStep(step, ctx, state);
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
