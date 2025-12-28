import type { BuildContext } from './context';
import type { BuildOptions, BuildPipelineState, BuildStep } from './types';
import { formatBuildError } from './errors';
import { resetPluginState } from './plugins';
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
 * Steps in nested arrays run in parallel.
 */
const BUILD_STEPS: (BuildStep | BuildStep[])[] = [
  ensureDependenciesStep,
  resetDirectoriesStep,
  createTsxEntriesStep,
  [tailwindCssStep, serverBuildStep],
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
    options,
    outputs: {},
    timings: {},
  };
}

/**
 * Extract step number from step name (e.g., "03-foo" -> "03", "05b-bar" -> "05b")
 */
export function getStepNumber(name: string): string {
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
  resetPluginState();

  // Execute steps in order
  for (const stepOrGroup of BUILD_STEPS) {
    try {
      // Handle parallel group
      if (Array.isArray(stepOrGroup)) {
        const runnableSteps = stepOrGroup.filter(
          (s) => !s.shouldRun || s.shouldRun(ctx, state)
        );

        if (runnableSteps.length > 0) {
          log.debug(`Running parallel: ${runnableSteps.map((s) => s.description).join(' + ')}`);
          await Promise.all(runnableSteps.map((s) => executeStep(s, ctx, state)));
        }
        continue;
      }

      // Handle single step
      const step = stepOrGroup;
      if (step.shouldRun && !step.shouldRun(ctx, state)) {
        log.debug(`Skipping step: ${step.description}`);
        continue;
      }

      await executeStep(step, ctx, state);
    } catch (error) {
      state.error = error instanceof Error ? error : new Error(String(error));
      state.failedStep = Array.isArray(stepOrGroup) ? stepOrGroup[0]?.name : stepOrGroup.name;
      throw new Error(formatBuildError(state.error));
    }
  }

  // Print timing breakdown in debug mode
  log.debug('=== TIMING BREAKDOWN ===');
  for (const [name, ms] of Object.entries(state.timings)) {
    log.debug(`  ${name}: ${ms.toFixed(0)}ms`);
  }

  return state;
}
