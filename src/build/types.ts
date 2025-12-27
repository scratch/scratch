import type { BuildContext, Entry } from './context';

/**
 * Enumeration of all build phases for progress tracking
 */
export enum BuildPhase {
  NotStarted = 'not_started',
  EnsureDependencies = 'ensure_dependencies',
  ResetDirectories = 'reset_directories',
  CreateTsxEntries = 'create_tsx_entries',
  TailwindCss = 'tailwind_css',
  ServerBuild = 'server_build',
  RenderServer = 'render_server',
  ClientBuild = 'client_build',
  GenerateHtml = 'generate_html',
  InjectFrontmatter = 'inject_frontmatter',
  CopyPagesStatic = 'copy_pages_static',
  CopyPublicStatic = 'copy_public_static',
  CopyToDist = 'copy_to_dist',
  Completed = 'completed',
  Failed = 'failed',
}

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
}

/**
 * Pipeline state that flows through all build steps
 */
export interface BuildPipelineState {
  /** Current phase of the build */
  phase: BuildPhase;

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
export interface BuildStep<TOutput = void> {
  /** Unique identifier for the step */
  name: string;

  /** Human-readable description for logging */
  description: string;

  /** The build phase this step represents */
  phase: BuildPhase;

  /**
   * Check if this step should run given current state.
   * Return false to skip (e.g., server build only runs if ssg:true)
   * Optional - defaults to true if not defined.
   */
  shouldRun?(ctx: BuildContext, state: BuildPipelineState): boolean;

  /**
   * Execute the step.
   * @returns Step output data (stored in state.outputs by orchestrator)
   * @throws Error on failure (orchestrator catches and handles)
   */
  execute(ctx: BuildContext, state: BuildPipelineState): Promise<TOutput>;
}

/**
 * Helper to define a step with proper typing
 */
export function defineStep<TOutput = void>(
  step: BuildStep<TOutput>
): BuildStep<TOutput> {
  return step;
}

/**
 * Step-specific output types
 */
export interface TsxEntriesOutput {
  entries: Record<string, Entry>;
  clientEntryPts: Record<string, string>;
  serverEntryPts: Record<string, string> | null;
}

export interface TailwindOutput {
  cssFilename: string | null;
}

export interface ServerBuildOutput {
  buildResult: BunBuildResult | null;
}

export interface ClientBuildOutput {
  buildResult: BunBuildResult;
  jsOutputMap: Record<string, string>;
}

export interface RenderServerOutput {
  renderedContent: Map<string, string>;
}
