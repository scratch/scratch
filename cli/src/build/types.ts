import type { BuildContext, Entry } from './context';

/**
 * Options passed to the build command
 */
export interface BuildOptions {
  ssg?: boolean;
  static?: 'public' | 'assets' | 'all';
}

/**
 * Result of a Bun.build() call
 */
export type BunBuildResult = Awaited<ReturnType<typeof Bun.build>>;

/**
 * Aggregated outputs from all steps, stored in BuildPipelineState
 */
export interface StepOutputs {
  entries?: Record<string, Entry>;
  clientEntryPts?: Record<string, string>;
  serverEntryPts?: Record<string, string> | null;
  cssFilename?: string | null;
  serverBuildResult?: BunBuildResult | null;
  clientBuildResult?: BunBuildResult;
  jsOutputMap?: Record<string, string>;
  renderedContent?: Map<string, string>;
  buildStats?: { fileCount: number; totalBytes: number };
}

/**
 * Pipeline state that flows through all build steps
 */
export interface BuildPipelineState {
  /** Build options passed from CLI */
  options: BuildOptions;

  /** Results from completed steps */
  outputs: StepOutputs;

  /** Timing data for each completed step */
  timings: Record<string, number>;

  /** Error that caused build failure, if any */
  error?: Error;

  /** The step that failed, if any */
  failedStep?: string;
}

/**
 * Interface for a build step
 */
export interface BuildStep {
  /** Unique identifier for the step */
  name: string;

  /** Human-readable description for logging */
  description: string;

  /**
   * Check if this step should run given current state.
   * Return false to skip (e.g., server build only runs if ssg:true)
   * Optional - defaults to true if not defined.
   */
  shouldRun?(ctx: BuildContext, state: BuildPipelineState): boolean;

  /**
   * Execute the step. Store outputs directly on state.outputs.
   * @throws Error on failure (orchestrator catches and handles)
   */
  execute(ctx: BuildContext, state: BuildPipelineState): Promise<void>;
}
