# Plan: Split Integration Tests into Separate Modules

## Overview

This plan details how to split `ops/commands/server/test.ts` (~1000 lines) into separate, focused modules while maintaining sequential execution and shared state. The file has already been migrated to use `bun:test` (recommendation #10 from `simplify-ops.md`).

**Reference:** This implements recommendation #2 from `plan/simplify-ops.md`.

---

## 1. Current State Analysis

### 1.1 Test Structure

The file is organized into one top-level `describe('Integration Tests', ...)` block with the following nested describe blocks:

| Describe Block | Test Count | Lines (approx) | Purpose |
|----------------|------------|----------------|---------|
| `Setup` | 7 tests | 200-307 | Build CLI, migrations, deploy, login, create project |
| `Step 8: Content verification` | 1 test | 309-328 | Verify deployed content matches local |
| `Step 8b: Static file serving` | 5 tests | 330-385 | MIME types, .mdx redirect |
| `Step 8c: Enumeration prevention` | 2 tests | 387-420 | Non-existent project redirects |
| `Step 8d: Content token URL cleanup` | 2 tests | 422-565 | Private project token handling |
| `Step 8d2: Share token URL cleanup` | 1 test | 567-663 | Share token redirect |
| `Step 8e: API token authentication` | 8 tests | 665-804 | Create, use, revoke API tokens |
| `Step 9: Project ID persistence` | 3 tests | 806-901 | ID persistence, rename, invalid ID |
| `Step 10: WWW domain serving` | 1 test | 903-993 | WWW/naked domain serving |

**Total: 30 tests across 9 describe blocks**

### 1.2 Shared State (TestContext)

```typescript
interface TestContext {
  // Configuration (read from vars file in beforeAll)
  instance: string
  config: { appUrl: string; pagesUrl: string; wwwUrl: string }
  vars: Map<string, string>
  varsPath: string
  wranglerPath: string
  baseDomain: string
  appDomain: string
  pagesDomain: string
  serverUrl: string

  // Created during Setup tests
  projectName: string           // Original random project name
  currentProjectName: string    // Updated if renamed in Step 9
  projectDir: string            // Temp directory for test project
  projectBaseUrl: string        // Base URL without trailing slash
  deployedUrl: string           // Full deployed URL with trailing slash
  localContent: string          // Contents of dist/index.html
  projectUrl: string            // Same as deployedUrl

  // Credentials (populated after login)
  bearerToken: string           // Session token from CLI credentials

  // Created during specific tests
  apiKeyToken: string           // API key (Step 8e)
  shareToken: string            // Share token (Step 8d2)
  contentToken: string          // Content token (Step 8d)
  privateProjectName: string    // Private project (Step 8d)
  privateProjectDir: string     // Private project dir (Step 8d)
  privateProjectUrl: string     // Private project URL (Step 8d)

  // Background process
  logsProcess: ReturnType<typeof Bun.spawn> | null
}
```

### 1.3 Test Dependencies Map

Critical insight: **Tests are sequential and stateful**. Each test may depend on context set by previous tests.

```
Setup (Steps 1-7)
    |
    +---> Step 8 (Content verification)
    |         |
    |         +---> Step 8b (Static file serving) - uses ctx.projectBaseUrl
    |         +---> Step 8c (Enumeration prevention) - uses ctx.deployedUrl, ctx.pagesDomain
    |
    +---> Step 8d (Content token) - uses ctx.bearerToken, ctx.serverUrl
    |         - Creates: ctx.privateProjectName, ctx.privateProjectDir, ctx.privateProjectUrl, ctx.contentToken
    |         - Cleans up its own private project
    |
    +---> Step 8d2 (Share token) - uses ctx.bearerToken, ctx.serverUrl
    |         - Creates temp project, cleans up
    |
    +---> Step 8e (API token) - uses ctx.bearerToken, ctx.serverUrl, ctx.deployedUrl
    |         - Creates: ctx.apiKeyToken (but token is revoked at end)
    |
    +---> Step 9 (Project ID persistence) - uses ctx.projectDir, ctx.serverUrl
    |         - Modifies: ctx.currentProjectName (after rename)
    |
    +---> Step 10 (WWW domain) - uses ctx.vars, ctx.varsPath, ctx.currentProjectName
              - Temporarily modifies vars file, restores at end
```

### 1.4 Cleanup Responsibilities

- **afterAll**: Deletes main test project (`ctx.currentProjectName`), stops log tail, removes temp directory
- **Step 8d**: Creates and deletes its own private project
- **Step 8d2**: Creates and deletes its own share test project
- **Step 8e**: Creates and deletes a temp project for env var test

### 1.5 Current Entry Point

```typescript
export async function integrationTestAction(inst: string): Promise<void> {
  // Spawn bun test with TEST_INSTANCE env var
  const proc = Bun.spawn([
    'bun', 'test', './ops/commands/server/test.ts',
    '--timeout', '600000',
  ], {
    env: { ...process.env, TEST_INSTANCE: inst },
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
```

---

## 2. Target Architecture

### 2.1 Proposed File Structure

```
ops/commands/server/test/
├── index.ts              # Entry point + orchestrator
├── context.ts            # TestContext type, init, cleanup, helpers
├── setup.ts              # Steps 1-7: Build, migrate, deploy, login, create
├── content.ts            # Step 8: Content verification
├── static-files.ts       # Step 8b: Static file serving tests
├── enumeration.ts        # Step 8c: Enumeration prevention
├── content-token.ts      # Step 8d: Content token URL cleanup
├── share-token.ts        # Step 8d2: Share token URL cleanup
├── api-token.ts          # Step 8e: API token authentication
├── persistence.ts        # Step 9: Project ID persistence
└── www-domain.ts         # Step 10: WWW domain serving
```

### 2.2 How to Share TestContext Across Files

**Approach: Shared module-level variable via context.ts**

```typescript
// ops/commands/server/test/context.ts

// Module-level context - initialized once, shared across all test files
let ctx: TestContext | null = null

export function getContext(): TestContext {
  if (!ctx) {
    throw new Error('TestContext not initialized. Call initializeContext() first.')
  }
  return ctx
}

export async function initializeContext(instance: string): Promise<TestContext> {
  if (ctx) {
    return ctx // Already initialized
  }
  ctx = await createTestContext(instance)
  return ctx
}

export async function cleanupContext(): Promise<void> {
  if (ctx) {
    await cleanup(ctx)
    ctx = null
  }
}
```

Each test file imports `getContext()`:

```typescript
// ops/commands/server/test/static-files.ts
import { describe, test, expect } from 'bun:test'
import { getContext } from './context'

describe('Step 8b: Static file serving', () => {
  test('.md files are served as text/plain', async () => {
    const ctx = getContext()
    // ... test using ctx.projectBaseUrl
  })
})
```

### 2.3 Maintaining Sequential Execution Across Files

**Critical constraint:** Tests MUST run in order because they depend on shared state.

**Important architectural note:** Simply importing files does NOT nest their describe blocks inside a parent describe. Imports execute at module load time, before any describe block body runs. Therefore, we MUST use the wrapper function pattern.

**Solution: Wrapper function pattern with explicit registration**

```typescript
// ops/commands/server/test/index.ts
import { describe, beforeAll, afterAll } from 'bun:test'
import { initializeContext, cleanupContext, registerSigintHandler } from './context'
import { setupTests } from './setup'
import { contentTests } from './content'
import { staticFileTests } from './static-files'
import { enumerationTests } from './enumeration'
import { contentTokenTests } from './content-token'
import { shareTokenTests } from './share-token'
import { apiTokenTests } from './api-token'
import { persistenceTests } from './persistence'
import { wwwDomainTests } from './www-domain'

const instance = process.env.TEST_INSTANCE

if (instance) {
  describe('Integration Tests', () => {
    beforeAll(async () => {
      await initializeContext(instance)
      registerSigintHandler()
    })

    afterAll(async () => {
      await cleanupContext()
    })

    // Explicitly call test registration functions IN ORDER
    // Each function calls describe() which registers its tests
    setupTests()
    contentTests()
    staticFileTests()
    enumerationTests()
    contentTokenTests()
    shareTokenTests()
    apiTokenTests()
    persistenceTests()
    wwwDomainTests()
  })
}

// Entry point for CLI
export async function integrationTestAction(inst: string): Promise<void> {
  const proc = Bun.spawn([
    'bun', 'test', './ops/commands/server/test/index.ts',
    '--timeout', '600000',
  ], {
    env: { ...process.env, TEST_INSTANCE: inst },
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
```

Each test file exports a registration function:

```typescript
// ops/commands/server/test/static-files.ts
import { describe, test, expect } from 'bun:test'
import { getContext } from './context'

export function staticFileTests() {
  describe('Step 8b: Static file serving', () => {
    test('.md files are served as text/plain', async () => {
      const ctx = getContext()
      // ...
    })
  })
}
```

**Why this works:**
1. Bun runs tests sequentially by default (no `--preload` or concurrency flags)
2. The registration functions are called inside the parent describe block, so their describe blocks are nested correctly
3. Functions are called in order, so tests register in the correct sequence
4. Within each file, tests run in definition order
5. Module-level context is shared across all files

---

## 3. File Breakdown

### 3.1 context.ts (~150 lines)

**Purpose:** TestContext type definition, initialization, cleanup, and shared utilities

**Contents:**
- `TestContext` interface
- `generateRandomProjectName()` helper
- `initializeContext(instance)` function
- `cleanupContext()` function
- `getContext()` accessor
- `registerSigintHandler()` for Ctrl-C cleanup
- Re-export of colors for consistent output (`green`, `yellow`, `red`, `reset`)

**Imports:**
```typescript
import { existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rm, readFile } from 'fs/promises'
import { green, yellow, red, reset } from '../../../../lib/output'
import { parseVarsFile, writeVarsFile, getInstanceVarsPath, getInstanceWranglerPath } from '../../../../lib/config'
import { runCommand } from '../../../../lib/process'
```

### 3.2 setup.ts (~120 lines)

**Purpose:** Steps 1-7 setup tests

**Contains:**
- `describe('Setup', ...)` with 7 tests:
  - Step 1: Build CLI
  - Step 2: Run migrations
  - Step 3: Deploy server
  - Step 4: Start log tail
  - Step 5: Login with CLI
  - Step 6: Create scratch project
  - Step 7: Deploy scratch project

**Context mutations:**
- Sets `ctx.logsProcess` (Step 4)
- Sets `ctx.bearerToken` (Step 5)
- Sets `ctx.deployedUrl`, `ctx.projectBaseUrl`, `ctx.projectUrl`, `ctx.localContent` (Step 7)

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'
import { getContext } from './context'
import { runCommand, runCommandInherit, getWranglerConfig } from '../../../../lib/process'
import { green, reset } from '../../../../lib/output'
```

### 3.3 content.ts (~25 lines)

**Purpose:** Step 8 content verification

**Contains:**
- `describe('Step 8: Content verification', ...)` with 1 test

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { getContext } from './context'
import { green, reset } from '../../../../lib/output'
```

### 3.4 static-files.ts (~60 lines)

**Purpose:** Step 8b static file serving tests

**Contains:**
- `describe('Step 8b: Static file serving', ...)` with 5 tests:
  - .md files served as text/plain
  - .txt files served as text/plain
  - .mdx URL redirects to .md
  - .mdx redirect serves correct content
  - Compiled HTML page is accessible

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { getContext } from './context'
import { green, reset } from '../../../../lib/output'
```

### 3.5 enumeration.ts (~40 lines)

**Purpose:** Step 8c enumeration prevention tests

**Contains:**
- `describe('Step 8c: Enumeration prevention', ...)` with 2 tests:
  - Non-existent project redirects to auth
  - Public project serves content directly

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { getContext } from './context'
import { green, reset } from '../../../../lib/output'
```

### 3.6 content-token.ts (~150 lines)

**Purpose:** Step 8d content token URL cleanup tests

**Contains:**
- `describe('Step 8d: Content token URL cleanup', ...)` with 2 tests:
  - Private project receives content token and redirects
  - Query params are preserved during redirect

**Note:** This test creates and cleans up its own private project within the tests.

**Context mutations:**
- Sets `ctx.privateProjectName`, `ctx.privateProjectDir`, `ctx.privateProjectUrl`, `ctx.contentToken`

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFile, rm } from 'fs/promises'
import { getContext, generateRandomProjectName } from './context'
import { runCommand, runCommandInherit } from '../../../../lib/process'
import { green, reset } from '../../../../lib/output'
```

### 3.7 share-token.ts (~100 lines)

**Purpose:** Step 8d2 share token URL cleanup test

**Contains:**
- `describe('Step 8d2: Share token URL cleanup', ...)` with 1 test

**Note:** This test checks if share tokens are enabled, creates/cleans up its own test project.

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { tmpdir } from 'os'
import { rm } from 'fs/promises'
import { getContext, generateRandomProjectName } from './context'
import { runCommand, runCommandInherit } from '../../../../lib/process'
import { green, yellow, reset } from '../../../../lib/output'
```

### 3.8 api-token.ts (~150 lines)

**Purpose:** Step 8e API token authentication tests

**Contains:**
- `describe('Step 8e: API token authentication', ...)` with 8 tests:
  - Create API token
  - Token appears in list
  - Authenticate with API token via X-Api-Key header
  - Deploy using SCRATCH_TOKEN env var
  - Revoke token
  - Revoked token is rejected
  - Invalid token is rejected
  - API token must NOT work on content domain (security invariant)

**Context mutations:**
- Sets `ctx.apiKeyToken`

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { tmpdir } from 'os'
import { rm } from 'fs/promises'
import { getContext, generateRandomProjectName } from './context'
import { runCommand } from '../../../../lib/process'
import { green, reset } from '../../../../lib/output'
```

### 3.9 persistence.ts (~100 lines)

**Purpose:** Step 9 project ID persistence tests

**Contains:**
- `describe('Step 9: Project ID persistence', ...)` with 3 tests:
  - Step 9a: project ID was saved
  - Step 9b: rename project and publish again
  - Step 9c: invalid project ID error handling

**Context mutations:**
- Sets `ctx.currentProjectName` after rename

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { getContext } from './context'
import { runCommand } from '../../../../lib/process'
import { green, yellow, reset } from '../../../../lib/output'
```

### 3.10 www-domain.ts (~100 lines)

**Purpose:** Step 10 WWW domain serving test

**Contains:**
- `describe('Step 10: WWW domain serving', ...)` with 1 test

**Note:** This test modifies the vars file and redeploys, then restores. It's a complex test that requires careful handling.

**Imports:**
```typescript
import { describe, test, expect } from 'bun:test'
import { writeFileSync } from 'fs'
import { getContext } from './context'
import { writeVarsFile } from '../../../../lib/config'
import { generateWranglerConfig } from '../../setup'
import { runCommand, runCommandInherit } from '../../../../lib/process'
import { green, yellow, reset } from '../../../../lib/output'
```

### 3.11 index.ts (~70 lines)

**Purpose:** Entry point, test orchestration, and CLI action export

**Contains:**
- Import statements for all test files (in order)
- Top-level `describe('Integration Tests', ...)` wrapper
- `beforeAll` for context initialization
- `afterAll` for cleanup
- `integrationTestAction()` export for CLI

---

## 4. Migration Strategy

### 4.1 Preparation Phase

1. **Create test directory structure**
   ```bash
   mkdir -p ops/commands/server/test
   ```

2. **Create context.ts first** - Extract TestContext, init, cleanup, helpers from current test.ts

3. **Verify context.ts compiles** - Run `bun build ops/commands/server/test/context.ts --dry-run`

### 4.2 Incremental Migration (Test by Test)

The safest approach is to migrate one describe block at a time:

**Step 1: Create index.ts and context.ts**
- Move TestContext interface to context.ts
- Move `initializeTestContext()`, `cleanup()`, `registerSigintHandler()` to context.ts
- Create index.ts with beforeAll/afterAll and import of test.ts
- Verify tests still pass

**Step 2: Extract Setup tests**
- Move `describe('Setup', ...)` block to setup.ts
- Update imports in setup.ts
- Import setup.ts from index.ts
- Verify tests still pass

**Step 3-10: Extract remaining describe blocks**
- One at a time, in order: content, static-files, enumeration, content-token, share-token, api-token, persistence, www-domain
- After each extraction, verify tests pass

**Step 11: Delete original test.ts**
- Once all tests are migrated and passing, remove the old test.ts file
- Update any imports that referenced the old location

### 4.3 Verification After Each Step

```bash
# Run full test suite
bun ops server -i staging test

# Verify output matches expected format
# Verify all 29 tests pass
# Verify cleanup runs (check that test project is deleted)
```

### 4.4 Order of File Creation

1. `context.ts` - Must exist first (others depend on it)
2. `index.ts` - Entry point
3. `setup.ts` - Creates context state other tests depend on
4. `content.ts` - Simple, depends only on setup
5. `static-files.ts` - Simple, depends only on setup
6. `enumeration.ts` - Simple, depends only on setup
7. `content-token.ts` - Self-contained (creates own project)
8. `share-token.ts` - Self-contained (creates own project)
9. `api-token.ts` - Mostly self-contained
10. `persistence.ts` - Modifies ctx.currentProjectName
11. `www-domain.ts` - Most complex, depends on persistence (uses currentProjectName)

---

## 5. Risk Mitigation

### 5.1 What Could Go Wrong

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tests run out of order | High - cascading failures | Use single index.ts import order, verify with explicit logging |
| Context not shared between files | High - undefined errors | Use singleton pattern in context.ts, test getContext() before full migration |
| Circular imports | Medium - module load errors | Keep imports unidirectional (context <- all others) |
| beforeAll runs multiple times | Medium - wasted time | Only put beforeAll/afterAll in index.ts |
| Some tests don't see context mutations | High - test failures | Document which tests mutate context, verify state flows |
| CLI command stops working | High - can't run tests | Update path in integrationTestAction early, test immediately |

### 5.2 Ensuring Sequential Execution

**Verification approach:**

1. Add numbered console.log at start of each test file:
   ```typescript
   console.log('[DEBUG] Loading static-files.ts tests...')
   ```

2. Run tests and verify console output shows files loading in expected order

3. Remove debug logging after verification

**Bun guarantees:**
- Tests in a single file run sequentially (in definition order)
- Import order determines test registration order
- No parallel execution unless explicitly enabled

### 5.3 Preserving Console Output

All `console.log()` statements must remain in the migrated code. The colored output format (`${green}...${reset}`) is part of the test UX.

Checklist for each migrated file:
- [ ] All console.log statements preserved
- [ ] Colors imported from correct location
- [ ] Output matches original format

### 5.4 Rollback Strategy

1. **Keep original test.ts** during migration (rename to test.ts.backup)

2. **Git commits** after each successful extraction:
   ```bash
   git add ops/commands/server/test/
   git commit -m "Extract [describe block name] to separate file"
   ```

3. **Quick rollback**: Restore test.ts.backup, delete test/ directory:
   ```bash
   rm -rf ops/commands/server/test/
   mv ops/commands/server/test.ts.backup ops/commands/server/test.ts
   ```

4. **No external dependencies**: This change only affects the ops/ directory, no database migrations or server changes needed

### 5.5 Testing the Migration

**Full verification checklist:**

- [ ] `bun ops server -i staging test` works (entry point unchanged)
- [ ] All 30 tests pass
- [ ] Test output format unchanged (colors, checkmarks)
- [ ] Cleanup runs on success (test project deleted)
- [ ] Cleanup runs on test failure (test project deleted)
- [ ] Cleanup runs on Ctrl-C (test project deleted)
- [ ] Context mutations flow correctly between files
- [ ] No TypeScript errors
- [ ] No circular import warnings

---

## 6. Implementation Checklist

### Pre-Work
- [ ] Read this plan completely
- [ ] Verify `bun ops server -i staging test` works before starting
- [ ] Create backup: `cp ops/commands/server/test.ts ops/commands/server/test.ts.backup`

### Phase 1: Setup Structure
- [ ] Create `ops/commands/server/test/` directory
- [ ] Create `context.ts` with TestContext, init, cleanup, helpers
- [ ] Verify context.ts compiles without errors

### Phase 2: Create Entry Point
- [ ] Create `index.ts` with integrationTestAction export
- [ ] Update path in integrationTestAction to `./ops/commands/server/test/index.ts`
- [ ] Add import of original test.ts (temporarily)
- [ ] Verify tests still pass with new entry point

### Phase 3: Extract Test Files (one at a time)
- [ ] Extract `setup.ts` (Steps 1-7)
- [ ] Verify tests pass
- [ ] Extract `content.ts` (Step 8)
- [ ] Verify tests pass
- [ ] Extract `static-files.ts` (Step 8b)
- [ ] Verify tests pass
- [ ] Extract `enumeration.ts` (Step 8c)
- [ ] Verify tests pass
- [ ] Extract `content-token.ts` (Step 8d)
- [ ] Verify tests pass
- [ ] Extract `share-token.ts` (Step 8d2)
- [ ] Verify tests pass
- [ ] Extract `api-token.ts` (Step 8e)
- [ ] Verify tests pass
- [ ] Extract `persistence.ts` (Step 9)
- [ ] Verify tests pass
- [ ] Extract `www-domain.ts` (Step 10)
- [ ] Verify tests pass

### Phase 4: Cleanup
- [ ] Remove original test.ts
- [ ] Remove test.ts.backup
- [ ] Run full test suite one more time
- [ ] Verify all checklist items from 5.5

---

## 7. Estimated Effort

| Task | Estimated Time |
|------|----------------|
| Phase 1: Setup structure | 30 min |
| Phase 2: Create entry point | 30 min |
| Phase 3: Extract 10 test files | 3-4 hours |
| Phase 4: Cleanup and verification | 30 min |
| **Total** | **5-6 hours** |

---

## 8. Future Considerations (Out of Scope)

1. **Parallel test execution** - Some test groups (static-files, enumeration) could theoretically run in parallel after setup completes. Not worth the complexity given sequential dependencies.

2. **Test fixtures** - Could pre-create test projects and reuse across runs. Would require cleanup tracking and add complexity.

3. **Per-file test running** - After split, could add ability to run individual test files. Would require making each file able to initialize context independently.

4. **Shared test utilities** - If more test files are added later, consider extracting common assertion patterns to a test-utils.ts file.

---

## 9. Appendix: File Size Summary

| File | Estimated Lines | % of Original |
|------|-----------------|---------------|
| context.ts | 150 | 15% |
| index.ts | 70 | 7% |
| setup.ts | 120 | 12% |
| content.ts | 25 | 2.5% |
| static-files.ts | 60 | 6% |
| enumeration.ts | 40 | 4% |
| content-token.ts | 150 | 15% |
| share-token.ts | 100 | 10% |
| api-token.ts | 150 | 15% |
| persistence.ts | 100 | 10% |
| www-domain.ts | 100 | 10% |
| **Total** | **~1045** | ~100% |

Note: Line counts are approximate. The split adds some overhead from repeated imports and function boundaries, but improves maintainability significantly.

---

## 10. Review Notes

**Last reviewed:** 2026-02-01

### Issues Found and Corrected

1. **Test count error** - The plan stated 29 tests, but the actual implementation has 30 tests (8 in API token section, not 7). The "API token must NOT work on content domain" test was not counted.

2. **Architecture flaw in Section 2.3** - The original plan suggested that importing files would nest their describe blocks inside the parent describe. This is incorrect: module imports execute at load time before the describe block body runs. The plan has been updated to use the wrapper function pattern as the primary (and only) approach.

3. **Import path depth errors** - All relative import paths in the File Breakdown section referenced `../../../lib/*` but should be `../../../../lib/*` since the test files are in `ops/commands/server/test/` (4 levels deep from the ops root).

4. **www-domain.ts import for generateWranglerConfig** - The path `../setup` was incorrect; it should be `../../setup` to reference `ops/commands/server/setup.ts`.

### Verified Correct

1. **TestContext interface** - Matches the actual implementation in `ops/commands/server/test.ts`.

2. **Test dependency map** - Accurately reflects the sequential dependencies in the current implementation.

3. **Singleton context pattern** - Will work correctly with Bun's sequential test execution.

4. **Migration strategy** - Incremental approach with verification after each step is sound.

5. **CLI command compatibility** - The `integrationTestAction` export and path update are correct.

### Recommendations

1. **Prefer the wrapper pattern** - The wrapper function pattern (`export function staticFileTests() { describe(...) }`) should be the only documented approach, not an "alternative." The simple import approach does not work for nesting describe blocks.

2. **Test the pattern first** - Before starting the full migration, create a minimal proof-of-concept with 2-3 test files to verify the wrapper pattern works correctly with Bun's test runner.

3. **index.ts line count** - The estimate of 50 lines may be slightly low given the full list of imports and the `integrationTestAction` export. Estimate ~70 lines.

### Cross-Reference Verification

- **ops/commands/server/test.ts**: The plan accurately describes the current implementation structure.
- **plan/use-test-framework.md**: This plan was successfully completed. The current `test.ts` already uses `bun:test`. The split-tests-out.md plan correctly builds on that foundation.
