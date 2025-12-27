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

## 3.1 Refactor orchestrator output storage (optional)

**What:** `storeStepOutput()` uses brittle string matching on step names.

**Alternative:** Let steps handle their own output storage via `storeOutput()` method.

---

## 3.2 Make parallel execution declarative (optional)

**What:** Hard-coded `if (step.name === '04-tailwind-css')` check.

**Alternative:** Add `parallelWith?: string` to step interface.

---

## 3.3 Remove `BuildPhase` enum (optional)

**What:** 14-value enum that mirrors step names. May be unused.

**Action:** Audit if `state.phase` is consumed. If not, remove.

---

## 3.4 Remove global context pattern (optional)

**What:** `setBuildContext()`/`getBuildContext()` global state pattern.

**Alternative:** Pass context as parameter (steps already receive it).
