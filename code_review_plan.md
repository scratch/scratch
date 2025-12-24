# Code Review Plan: scratch CLI

## Project Overview

**scratch** is a CLI tool for building static MDX-based websites using Bun. Users create `.md` and `.mdx` files in a `pages/` directory and custom React components in `components/`, and the CLI compiles them into a static site.

## Architectural Overview

The codebase is ~3000 lines across 14 TypeScript files.

### Dependency Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     src/index.ts (156 lines)                │
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
│                  src/context.ts (537 lines)                 │
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
│  (105 lines)  │   │  (36 lines)   │   │  (7 lines)    │
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

| File | Lines | Status | Key Recommendations |
|------|-------|--------|---------------------|
| `src/index.ts` | 156 | ✅ Done | Extract try/catch wrapper; simplify `--ssg` to `--no-ssg`; fix unused `path` param confusion |
| `src/context.ts` | 537 | ⏳ Pending | |
| `src/template.ts` | 175 | ⏳ Pending | |
| `src/buncfg.ts` | 237 | ⏳ Pending | |
| `src/cmd/build.ts` | 623 | ⏳ Pending | |
| `src/cmd/dev.ts` | 224 | ⏳ Pending | |
| `src/cmd/create.ts` | 71 | ⏳ Pending | |
| `src/cmd/preview.ts` | 110 | ⏳ Pending | |
| `src/cmd/update.ts` | 185 | ⏳ Pending | |
| `src/cmd/revert.ts` | 154 | ⏳ Pending | |
| `src/preprocess.ts` | 367 | ⏳ Pending | |
| `src/util.ts` | 105 | ⏳ Pending | |
| `src/logger.ts` | 36 | ⏳ Pending | |
| `src/version.ts` | 7 | ⏳ Pending | |

---

## Detailed File Reviews

### src/index.ts (156 lines) ✅

**Purpose:** CLI entry point using Commander.js. Defines all available commands and their options, sets up global hooks for logging and context initialization.

**Structure:**
- Lines 1-13: Imports
- Lines 15-22: Program setup with global options (`-v`, `-q`)
- Lines 24-38: `create` command
- Lines 40-68: `build` command
- Lines 70-85: `dev` command
- Lines 87-100: `preview` command
- Lines 102-115: `clean` command
- Lines 117-127: `update` command
- Lines 129-142: `revert` command
- Lines 144-154: `preAction` hook (sets log level, initializes BuildContext)
- Line 156: `program.parse()`

**Recommendations:**

1. **Extract repetitive try/catch pattern (HIGH IMPACT)** - Every action has identical error handling. Create a wrapper:
   ```typescript
   function wrapAction(name: string, handler: Function) {
     return async (...args: any[]) => {
       try {
         await handler(...args);
       } catch (error) {
         log.error(`${name} failed:`, error);
         process.exit(1);
       }
     };
   }
   ```

2. **The `path` argument is captured but not used** - The `preAction` hook sets `options.path`, making the positional `path` param in actions redundant/confusing.

3. **Simplify `--ssg` flag** - Replace complex parser with `--no-ssg` (Commander handles `--no-X` automatically).

4. **Inconsistent logging** - `build` logs timing, others don't. Standardize.

---

## Next Up

`src/context.ts` - The core BuildContext class (537 lines)
