# Build Pipeline Cleanup Plan

We'll do each change one by one, reviewing and committing as we go.

---

## 1.1 Remove trivial `shouldRun()` methods

**What:** Make `shouldRun` optional in `BuildStep` interface with default `true`.

**Why:** 9 of 12 steps have `shouldRun() { return true; }` which is just noise.

**Files:**
- `src/build/types.ts` - Make `shouldRun` optional
- `src/build/orchestrator.ts` - Default to true when undefined
- Remove from 9 steps: `01`, `02`, `03`, `04`, `06`, `07`, `08`, `10`, `11`

**Keep `shouldRun` in these 3 steps (they have real logic):**
- `05-server-build.ts` - `ssg === true && serverEntryPts !== null`
- `05b-render-server.ts` - `ssg === true && serverBuildResult !== null`
- `09-copy-pages-static.ts` - `static !== 'public'`

---

## 1.2 Remove `defineStep()` identity function

**What:** Delete `defineStep` - it's an identity function that does nothing.

**Files:**
- `src/build/types.ts` - Delete the function
- All 12 step files - Change `defineStep({...})` to `{...} satisfies BuildStep<T>`

---

## 1.3 Remove unused `BUILD_STEPS` export

**What:** `BUILD_STEPS` is exported but never imported outside orchestrator.

**Files:**
- `src/build/index.ts` - Remove from exports
- `src/build/orchestrator.ts` - Remove from export statement

---

## 1.4 Remove step-specific output interfaces

**What:** These are only used for type casting and duplicate info from `BuildStep<T>`:
- `TsxEntriesOutput`
- `TailwindOutput`
- `ServerBuildOutput`
- `ClientBuildOutput`
- `RenderServerOutput`

**Files:**
- `src/build/types.ts` - Delete interfaces (lines 113-134)
- `src/build/orchestrator.ts` - Update `storeStepOutput` to not cast

---

## 1.5 Clean up copy-public logging

**What:** Remove unnecessary `readdir` that only logs file names.

**File:** `src/build/steps/10-copy-public-static.ts`

```typescript
// Remove this:
const files = await fs.readdir(ctx.staticDir);
for (const file of files) {
  log.debug(`  ${file}`);
}
```

---

## 2.1 Extract shared Bun.build error handling

**What:** Both `05-server-build.ts` and `06-client-build.ts` have ~25 identical lines of error handling.

**Files:**
- New: `src/build/util.ts` - Create `runBunBuild()` helper
- `src/build/steps/05-server-build.ts` - Use helper
- `src/build/steps/06-client-build.ts` - Use helper

---

## 2.2 Merge copy steps 09 & 10

**What:** Both steps do `fs.cp()` with minor variations. Merge into one.

**Files:**
- `src/build/steps/09-copy-pages-static.ts` - Add public/ copying
- `src/build/steps/10-copy-public-static.ts` - Delete
- `src/build/types.ts` - Remove `CopyPublicStatic` from enum
- `src/build/orchestrator.ts` - Remove from step list
- `src/build/steps/index.ts` - Remove export

---

## 2.3 Narrow exports in index.ts

**What:** Replace `export * from './types'` with explicit exports.

**File:** `src/build/index.ts`

```typescript
// Before
export * from './types';

// After
export type { BuildOptions, BuildPipelineState } from './types';
export { BuildPhase } from './types';
```

---

## 3.1 Refactor orchestrator output storage

### Problem

The orchestrator's `storeStepOutput()` function uses a brittle switch on step name strings:

```typescript
function storeStepOutput(step: BuildStep<any>, data: any, state: BuildPipelineState): void {
  switch (step.name) {
    case '03-create-tsx-entries':
      state.outputs.entries = data.entries;
      // ...
  }
}
```

**Issues:**
1. If a step name changes, this breaks silently (no compile-time error)
2. Orchestrator must know about every step's output structure
3. Output storage logic is separated from the step that produces it

### Solution

Steps already receive `state` in `execute()`. Just have them write directly to `state.outputs` instead of returning values.

### Changes

**1. Simplify `BuildStep` interface in `types.ts`:**

```typescript
// Before
export interface BuildStep<TOutput = void> {
  name: string;
  description: string;
  phase: BuildPhase;
  shouldRun?(ctx: BuildContext, state: BuildPipelineState): boolean;
  execute(ctx: BuildContext, state: BuildPipelineState): Promise<TOutput>;
}

// After - remove TOutput generic, execute always returns void
export interface BuildStep {
  name: string;
  description: string;
  phase: BuildPhase;
  shouldRun?(ctx: BuildContext, state: BuildPipelineState): boolean;
  execute(ctx: BuildContext, state: BuildPipelineState): Promise<void>;
}
```

**2. Delete from `types.ts`:**
- `TsxEntriesOutput` interface
- `TailwindOutput` interface
- `ServerBuildOutput` interface
- `ClientBuildOutput` interface
- `RenderServerOutput` interface

**3. Delete from `orchestrator.ts`:**
- `storeStepOutput()` function (~25 lines)
- All calls to `storeStepOutput()`
- Change `executeStep` to not return data

**4. Update 5 steps to store outputs directly:**

`03-create-tsx-entries.ts` - instead of returning `{ entries, clientEntryPts, serverEntryPts }`:
```typescript
state.outputs.entries = entries;
state.outputs.clientEntryPts = clientEntryPts;
state.outputs.serverEntryPts = serverEntryPts;
```

`04-tailwind-css.ts` - instead of returning `{ cssFilename }`:
```typescript
state.outputs.cssFilename = cssFilename;
```

`05-server-build.ts` - instead of returning `{ buildResult }`:
```typescript
state.outputs.serverBuildResult = buildResult;
```

`05b-render-server.ts` - instead of returning `{ renderedContent }`:
```typescript
state.outputs.renderedContent = renderedContent;
```

`06-client-build.ts` - instead of returning `{ buildResult, jsOutputMap }`:
```typescript
state.outputs.clientBuildResult = buildResult;
state.outputs.jsOutputMap = jsOutputMap;
```

### Files to modify

| File | Change |
|------|--------|
| `src/build/types.ts` | Remove `<TOutput>` generic, delete 5 output interfaces |
| `src/build/orchestrator.ts` | Delete `storeStepOutput()` and its calls |
| `src/build/steps/03-create-tsx-entries.ts` | Store on state, return void |
| `src/build/steps/04-tailwind-css.ts` | Store on state, return void |
| `src/build/steps/05-server-build.ts` | Store on state, return void |
| `src/build/steps/05b-render-server.ts` | Store on state, return void |
| `src/build/steps/06-client-build.ts` | Store on state, return void |

### Benefits

- **Simpler**: No return values, no intermediate storage step
- **Encapsulated**: Each step manages its own outputs
- **Safe refactoring**: Renaming steps won't break anything
- **Cleaner orchestrator**: Zero knowledge of step outputs

### Net impact

- ~25 lines removed from orchestrator (storeStepOutput + calls)
- ~25 lines removed from types.ts (5 output interfaces)
- ~5 lines removed from steps (return statements → direct assignment)
- **Net: ~55 lines removed**

---

## 3.2 Make parallel execution declarative

### Problem

The orchestrator has hard-coded logic to run tailwind + server build in parallel:

```typescript
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
      // ... error handling
    }
  }
}
```

**Issues:**
1. Hard-coded step name check - breaks if step is renamed
2. Assumes parallel step is next in array - fragile ordering assumption
3. Logic embedded in main loop - hard to follow
4. Can't easily add more parallel groups

### Solution

Use nested arrays in `BUILD_STEPS` to declare parallel groups:

```typescript
// Before
const BUILD_STEPS: BuildStep[] = [
  ensureDependenciesStep,
  resetDirectoriesStep,
  createTsxEntriesStep,
  tailwindCssStep,      // Hard-coded parallel logic in orchestrator
  serverBuildStep,      // Assumes this is next
  renderServerStep,
  // ...
];

// After - nested array means "run in parallel"
const BUILD_STEPS: (BuildStep | BuildStep[])[] = [
  ensureDependenciesStep,
  resetDirectoriesStep,
  createTsxEntriesStep,
  [tailwindCssStep, serverBuildStep],  // Declarative: run these in parallel
  renderServerStep,
  // ...
];
```

### Changes

**1. Update orchestrator loop to handle nested arrays:**

```typescript
for (const stepOrGroup of BUILD_STEPS) {
  // Handle parallel group
  if (Array.isArray(stepOrGroup)) {
    const runnableSteps = stepOrGroup.filter(
      (s) => !s.shouldRun || s.shouldRun(ctx, state)
    );

    if (runnableSteps.length > 0) {
      log.debug(`Running parallel: ${runnableSteps.map((s) => s.description).join(' + ')}`);

      try {
        await Promise.all(runnableSteps.map((s) => executeStep(s, ctx, state)));
      } catch (error) {
        // ... error handling
      }
    }
    continue;
  }

  // Handle single step (existing logic)
  const step = stepOrGroup;
  // ...
}
```

**2. Update BUILD_STEPS array:**

```typescript
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
```

**3. Delete the hard-coded parallel check (~20 lines)**

### Files to modify

| File | Change |
|------|--------|
| `src/build/orchestrator.ts` | Update loop to handle arrays, update BUILD_STEPS type |

### Benefits

- **Declarative**: Parallel groups are visible in the step list
- **Flexible**: Easy to add more parallel groups
- **Safe refactoring**: No step name checks
- **Self-documenting**: The array structure shows execution order

### Net impact

- ~20 lines removed (hard-coded parallel logic)
- ~10 lines added (generic parallel handling)
- **Net: ~10 lines removed**, cleaner code

---

## 3.3 Remove `BuildPhase` enum

### Problem

The `BuildPhase` enum has 14 values that mirror step names:

```typescript
export enum BuildPhase {
  NotStarted = 'not_started',
  EnsureDependencies = 'ensure_dependencies',
  ResetDirectories = 'reset_directories',
  // ... 11 more values
}
```

Each step declares its phase:
```typescript
export const resetDirectoriesStep: BuildStep = {
  name: '02-reset-directories',
  phase: BuildPhase.ResetDirectories,  // Redundant with name
  // ...
};
```

The orchestrator sets `state.phase` during execution:
```typescript
state.phase = step.phase;
state.phase = BuildPhase.Failed;
state.phase = BuildPhase.Completed;
```

**But `state.phase` is never read anywhere.** It's only set.

### Audit results

Searched for all usages of `state.phase` and `.phase`:
- `state.phase = step.phase` - set in executeStep
- `state.phase = BuildPhase.Failed` - set on error
- `state.phase = BuildPhase.Completed` - set at end

No code ever reads `state.phase`. The `BuildPipelineState` return value is not used by callers - they just `await` and ignore the result.

### Solution

Remove the enum entirely since it provides no value.

### Changes

**1. Delete from `types.ts`:**
- Delete `BuildPhase` enum (~15 lines)
- Remove `phase: BuildPhase` from `BuildStep` interface
- Remove `phase: BuildPhase` from `BuildPipelineState` interface

**2. Update `orchestrator.ts`:**
- Remove `import { BuildPhase }`
- Remove `phase: BuildPhase.NotStarted` from initial state
- Remove `state.phase = step.phase` from executeStep
- Remove `state.phase = BuildPhase.Failed` from error handling
- Remove `state.phase = BuildPhase.Completed` at end

**3. Update all 11 step files:**
- Remove `BuildPhase` from imports
- Remove `phase: BuildPhase.X` from step definitions

### Files to modify

| File | Change |
|------|--------|
| `src/build/types.ts` | Delete enum, remove `phase` from interfaces |
| `src/build/orchestrator.ts` | Remove phase tracking |
| `src/build/steps/*.ts` (11 files) | Remove phase imports and declarations |

### Benefits

- **Less code**: ~15 lines of enum + ~11 lines in steps + ~5 lines in orchestrator
- **No duplication**: Step name is sufficient identifier
- **Simpler interface**: `BuildStep` has fewer required fields

### Net impact

- ~30 lines removed
- One less concept to understand

---

## 3.4 Remove global context pattern

### Problem

The build system uses a global `CONTEXT` variable with getter/setter:

```typescript
let CONTEXT: BuildContext | undefined;

export function setBuildContext(opts) {
  CONTEXT = new BuildContext(opts);
}

export function getBuildContext(): BuildContext {
  if (CONTEXT === undefined) throw new Error('Build context not initialized');
  return CONTEXT;
}
```

**Issues:**
1. Global state is hard to test
2. Obscures data flow
3. Runtime error if called before initialization
4. Implicit coupling between modules

### Solution

Remove the global entirely. Create context at CLI entry point, pass it explicitly everywhere.

### Changes

**1. Update `context.ts`:**
- Delete global `CONTEXT` variable
- Delete `setBuildContext()` and `getBuildContext()` functions
- Export `BuildContext` class directly (already exported)

**2. Update `src/index.ts` (CLI entry point):**
```typescript
// Before
setBuildContext(opts);
// ... later
const ctx = getBuildContext();

// After
const ctx = new BuildContext(opts);
// Pass ctx to commands explicitly
```

**3. Update CLI commands to receive `ctx` as parameter:**

`cmd/build.ts`:
```typescript
// Before
export async function buildCommand(options, projectPath?) {
  const ctx = getBuildContext();

// After
export async function buildCommand(ctx: BuildContext, options, projectPath?) {
```

`cmd/dev.ts`, `cmd/preview.ts`, `cmd/view.ts` - same pattern

**4. Update `buncfg.ts`:**
- Add `ctx: BuildContext` parameter to `getBunBuildConfig()` and `getServerBunBuildConfig()`
- Pass `ctx` to plugin creator functions (closure capture)
- Remove all `getBuildContext()` calls

**5. Update build steps that call buncfg:**
- `05-server-build.ts` - pass `ctx` to `getServerBunBuildConfig(ctx, opts)`
- `06-client-build.ts` - pass `ctx` to `getBunBuildConfig(ctx, opts)`

### Files to modify

| File | Change |
|------|--------|
| `src/build/context.ts` | Delete global, delete getter/setter |
| `src/index.ts` | Create `BuildContext` directly, pass to commands |
| `src/cmd/build.ts` | Add `ctx` parameter |
| `src/cmd/dev.ts` | Add `ctx` parameter |
| `src/cmd/preview.ts` | Add `ctx` parameter |
| `src/cmd/view.ts` | Create own context, pass to build |
| `src/build/buncfg.ts` | Add `ctx` param to config functions |
| `src/build/steps/05-server-build.ts` | Pass `ctx` to config function |
| `src/build/steps/06-client-build.ts` | Pass `ctx` to config function |

### Benefits

- **No global state**: Context flows explicitly through the system
- **Testable**: Easy to create isolated contexts
- **Clear data flow**: Obvious where context comes from
- **Type safe**: Can't call without context

### Net impact

- ~10 lines removed (global + getter/setter)
- Explicit `ctx` parameter added to ~5 functions
- Cleaner architecture
