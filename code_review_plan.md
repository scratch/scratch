# Code Review Plan: scratch CLI

## Project Overview

**scratch** is a CLI tool for building static MDX-based websites using Bun. Users create `.md` and `.mdx` files in a `pages/` directory and custom React components in `components/`, and the CLI compiles them into a static site.

## Architectural Overview

The codebase is ~2800 lines across 14 TypeScript files (reduced from ~3000 after refactoring).

### Dependency Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     src/index.ts (140 lines)                │
│                     CLI Entry Point (Commander.js)          │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  cmd/build.ts │   │   cmd/dev.ts    │   │  cmd/create.ts  │
│   (623 lines) │   │   (224 lines)   │   │   (71 lines)    │
│  Main build   │   │   Dev server    │   │  Project init   │
└───────────────┘   └─────────────────┘   └─────────────────┘
        │                     │
        ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  src/context.ts (~420 lines)                │
│                  BuildContext - Core orchestrator           │
│   Paths, entries, components, dependencies, templates       │
└─────────────────────────────────────────────────────────────┘
        │                     │
        ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  buncfg.ts    │   │  template.ts    │   │  preprocess.ts  │
│  (237 lines)  │   │  (175 lines)    │   │  (367 lines)    │
│  Bun.build()  │   │  Template API   │   │  MDX→TSX        │
└───────────────┘   └─────────────────┘   └─────────────────┘

Supporting files:
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   util.ts     │   │  logger.ts    │   │  version.ts   │
│  (~175 lines) │   │  (36 lines)   │   │  (7 lines)    │
└───────────────┘   └───────────────┘   └───────────────┘
```

### Data Flow

1. User runs CLI command → `index.ts` parses args
2. Command handler creates `BuildContext` with project path
3. `BuildContext` discovers pages, components, resolves dependencies
4. `build.ts` orchestrates: preprocess MDX → build Tailwind → bundle with Bun → generate HTML
5. `template.ts` provides fallback files when user hasn't customized them

---

## File Review Progress

| File | Lines | Status | Key Changes Made |
|------|-------|--------|------------------|
| `src/index.ts` | 140 | ✅ Done | Extracted `withErrorHandling` wrapper; simplified `--ssg` to `--no-ssg`; consistent logging |
| `src/context.ts` | ~420 | ✅ Done | Moved utils to util.ts; simplified `ensureBuildDependencies`; converted to getters |
| `src/util.ts` | ~175 | ✅ Done | Added `spawnBunSync`, `bunInstall`, `rmWithRetry` from context.ts |
| `src/template.ts` | 175 | ✅ Done | No changes; noted potential simplification |
| `src/buncfg.ts` | 207 | ✅ Done | Removed dead `frontmatterStore`; extracted `createMdxBuildPlugin()` |
| `src/cmd/build.ts` | 623 | ⏳ Pending | Updated getter call sites |
| `src/cmd/dev.ts` | 224 | ⏳ Pending | |
| `src/cmd/create.ts` | 71 | ⏳ Pending | |
| `src/cmd/preview.ts` | 110 | ⏳ Pending | |
| `src/cmd/update.ts` | 185 | ⏳ Pending | |
| `src/cmd/revert.ts` | 154 | ⏳ Pending | |
| `src/preprocess.ts` | 367 | ⏳ Pending | |
| `src/logger.ts` | 36 | ⏳ Pending | |
| `src/version.ts` | 7 | ⏳ Pending | |

---

## Detailed File Reviews

### src/index.ts ✅

**Purpose:** CLI entry point using Commander.js. Defines all available commands and their options.

**Changes Made:**
1. Added `withErrorHandling(name, handler)` wrapper to eliminate duplicate try/catch blocks (~40 lines saved)
2. Simplified `--ssg [value]` with complex parser to `--no-ssg` (Commander handles automatically)
3. Changed `dev` and `preview` logging from `log.debug` to `log.info` for consistency
4. Removed unused parameters from `clean` action

---

### src/context.ts ✅

**Purpose:** Core orchestrator for the build system. Manages paths, discovers pages and components, handles dependency installation, resolves files with fallback to embedded templates.

**Changes Made:**

1. **Moved utility functions to `src/util.ts`:**
   - `spawnBunSync()` - spawn bun commands with BUN_BE_BUN=1
   - `bunInstall(cwd)` - run bun install with error handling
   - `rmWithRetry()` - file deletion with retry logic for EACCES/EBUSY

2. **Massively simplified `ensureBuildDependencies()`** (82 lines → 10 lines):
   - Removed Bun runtime bug workaround (re-exec after install) - no longer needed
   - Removed manual dependency checking loop
   - Now just: check for package.json → bunInstall in appropriate directory
   ```typescript
   async ensureBuildDependencies(): Promise<void> {
     const userPackageJson = path.resolve(this.rootDir, 'package.json');
     if (await fs.exists(userPackageJson)) {
       bunInstall(this.rootDir);
     } else {
       await this.ensureCachePackageJson();
       bunInstall(this.tempDir);
     }
   }
   ```

3. **Converted arrow function properties to getters:**
   ```typescript
   // Before
   clientSrcDir = () => _path.resolve(this.tempDir, 'client-src');

   // After
   get clientSrcDir(): string {
     return path.resolve(this.tempDir, 'client-src');
   }
   ```
   - Updated all call sites in `context.ts`, `cmd/build.ts`, and tests

4. **Renamed `_path` import to `path`** - conventional naming

5. **Removed unused `packageJsonPath` variable** in `resetTempDir()`

6. **Removed `spawnSync` import** - no longer needed after removing re-exec workaround

---

### src/util.ts ✅

**Purpose:** Shared utility functions.

**Changes Made:**
- Added `spawnBunSync()` - spawns bun with BUN_BE_BUN=1 env var
- Added `bunInstall(cwd)` - runs bun install with helpful error messages
- Added `rmWithRetry()` - file deletion with retry for transient errors
- Added `log` import for debug logging in rmWithRetry

---

### src/template.ts ✅

**Purpose:** Template system runtime API. Manages embedded templates compiled into the executable.

**Observations:**
- Clean tier system (minimal, src, examples) with well-designed API
- `isMinimalFile()` and `MINIMAL_FILES` constant are only used for a defensive "unknown tier" check
- Could be simplified by removing the tier abstraction and just filtering by prefix (`_build/`, `src/`, `pages/examples/`)
- Current approach is more defensive (whitelist) but adds ~30 lines for a "shouldn't happen" case

**Decision:** No changes made. Code works correctly; simplification deferred.

---

### src/buncfg.ts ✅

**Purpose:** Bun.build() configuration and plugins for client and server builds.

**Changes Made:**
1. **Removed dead `frontmatterStore`** - exported Map was populated but never read anywhere
2. **Extracted `createMdxBuildPlugin()`** - consolidated duplicate remark/rehype plugin building from both `getBunBuildConfig` and `getServerBunBuildConfig`
   - Takes `{ extractFrontmatter?: boolean }` option
   - Client build passes `{ extractFrontmatter: true }`, server uses default (false)
   - Reduced file from 237 → 207 lines

---

## Next Up

`src/cmd/build.ts` - Main build logic (623 lines)
