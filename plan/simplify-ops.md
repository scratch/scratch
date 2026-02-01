# Ops Directory Simplification Plan

## Executive Summary

The ops/ directory provides internal development tooling for server deployment, CLI building, releases, and git automation. After thorough review, the codebase is generally well-structured but has several opportunities for improvement:

1. **Code duplication** - Multiple files redefine the same helper functions (`run`, `runCapture`, etc.)
2. **Inconsistent process spawning** - Mix of `Bun.spawn`, `execSync`, `spawnSync` without clear rationale
3. **Overly long functions** - The integration test file is 1124 lines with a single ~1100 line function
4. **Duplicate constant definitions** - Auth-related constants defined in both `config.ts` and `setup.ts`
5. **Mixed concerns** - `colors.ts` contains both color codes AND validation utilities
6. **Wrangler path manipulation** - Repeated `.replace('server/', '')` pattern scattered across files

The most impactful improvements would be consolidating the process utilities, breaking up the monolithic test file, and centralizing the wrangler path handling.

---

## Current Architecture Overview

```
ops/
├── index.ts                    # Entry point, registers all commands
├── lib/
│   ├── colors.ts              # ANSI colors + validation utilities (25 lines)
│   ├── config.ts              # Configuration parsing and validation (331 lines)
│   └── process.ts             # Process spawning utilities (63 lines)
├── commands/
│   ├── cli.ts                 # CLI build/test commands (97 lines)
│   ├── commit.ts              # AI-assisted git commit (120 lines)
│   ├── pr.ts                  # AI-assisted PR creation (179 lines)
│   ├── release.ts             # Release automation (248 lines)
│   ├── website.ts             # Website publish command (31 lines)
│   └── server/
│       ├── index.ts           # Server subcommand registration (137 lines)
│       ├── config.ts          # Config check/push commands (383 lines)
│       ├── db.ts              # D1 database commands (184 lines)
│       ├── deploy.ts          # Deploy and logs commands (61 lines)
│       ├── env.ts             # Regenerate env.ts (13 lines)
│       ├── setup.ts           # Interactive setup wizard (409 lines)
│       └── test.ts            # Integration test suite (1124 lines)
└── test/
    └── config.test.ts         # Unit tests for config.ts (191 lines)
```

---

## Specific Recommendations

### 1. Consolidate Process Spawning Utilities

**Files:** `ops/lib/process.ts`, `ops/commands/commit.ts`, `ops/commands/pr.ts`, `ops/commands/release.ts`, `ops/commands/cli.ts`

**Current Code:**

Multiple files define their own versions of shell command helpers:

```typescript
// ops/commands/commit.ts:6-12
const runCapture = (cmd: string) => {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}
const run = (cmd: string) => {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' })
}

// ops/commands/pr.ts:7-17
const run = (cmd: string, opts?: { stdin?: boolean }) => {
  console.log(`$ ${cmd}`)
  const stdio = opts?.stdin === false
    ? ['ignore', 'inherit', 'inherit'] as const
    : 'inherit' as const
  return execSync(cmd, { encoding: 'utf-8', stdio })
}
const runCapture = (cmd: string) => {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

// ops/commands/release.ts:34-41
const run = (cmd: string) => {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' })
}
const runCapture = (cmd: string) => {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}
```

**Why Change:**
- DRY violation - same code repeated 4 times
- Inconsistent APIs - `run()` in pr.ts has options, others don't
- Mix of `execSync` and `Bun.spawn` without clear distinction
- Makes maintenance harder - bug fixes need to be applied in multiple places

**Improved Version:**

Extend `ops/lib/process.ts` to provide all needed variants:

```typescript
// ops/lib/process.ts

// For commands that need output captured
export function runCapture(cmd: string | string[]): string {
  const cmdArray = typeof cmd === 'string' ? cmd.split(' ') : cmd
  const proc = Bun.spawnSync(cmdArray, { stdout: 'pipe', stderr: 'pipe' })
  if (proc.exitCode !== 0) {
    throw new Error(`Command failed: ${proc.stderr.toString()}`)
  }
  return proc.stdout.toString().trim()
}

// For commands that should print to terminal
export function run(cmd: string | string[], options?: {
  cwd?: string
  stdin?: boolean
  echo?: boolean  // default true - print the command
}): void {
  const { cwd, stdin = true, echo = true } = options ?? {}
  const cmdArray = typeof cmd === 'string' ? cmd.split(' ') : cmd

  if (echo) {
    console.log(`$ ${typeof cmd === 'string' ? cmd : cmd.join(' ')}`)
  }

  const proc = Bun.spawnSync(cmdArray, {
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: stdin ? 'inherit' : undefined,
  })

  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode)
  }
}
```

**Priority:** HIGH - Affects 4 files, reduces ~40 lines of duplicated code

---

### 2. Split the Monolithic Integration Test File

**File:** `ops/commands/server/test.ts` (1124 lines)

**Current Code:**

The entire file is essentially one giant `integrationTestAction()` function that:
- Builds the CLI
- Runs migrations
- Deploys server
- Tests login flow
- Creates and deploys projects
- Tests static file serving
- Tests enumeration prevention
- Tests content tokens
- Tests share tokens
- Tests API tokens
- Tests project persistence
- Tests WWW domain serving
- Cleans up

**Why Change:**
- 1100+ lines in a single function is impossible to navigate
- Hard to run individual test sections
- Difficult to maintain or add new tests
- Error handling is inconsistent throughout
- No separation between test setup, execution, and cleanup

**Improved Version:**

Split into separate test modules with a test runner:

```typescript
// ops/commands/server/test/index.ts
export async function integrationTestAction(instance: string) {
  const ctx = await setupTestContext(instance)

  const tests = [
    buildCliTest,
    deployServerTest,
    loginTest,
    staticFileServingTest,
    enumerationPreventionTest,
    contentTokenTest,
    shareTokenTest,
    apiTokenTest,
    projectPersistenceTest,
    wwwDomainTest,
  ]

  try {
    for (const test of tests) {
      await test(ctx)
    }
  } finally {
    await cleanup(ctx)
  }
}

// ops/commands/server/test/static-files.ts
export async function staticFileServingTest(ctx: TestContext) {
  console.log('Testing static file serving...')
  // ~50 lines of focused test code
}
```

Suggested file structure:
```
ops/commands/server/test/
├── index.ts           # Test runner and context setup
├── context.ts         # TestContext type and setup/cleanup
├── build.ts           # CLI build test
├── deploy.ts          # Server deploy test
├── login.ts           # Login flow test
├── static-files.ts    # Static file serving tests
├── enumeration.ts     # Enumeration prevention test
├── content-token.ts   # Content token tests
├── share-token.ts     # Share token tests
├── api-token.ts       # API token tests
├── persistence.ts     # Project ID persistence tests
└── www-domain.ts      # WWW domain serving tests
```

**Priority:** HIGH - Massive improvement to maintainability

---

### 3. Centralize Wrangler Config Path Handling

**Files:** `ops/commands/server/config.ts`, `ops/commands/server/deploy.ts`, `ops/commands/server/db.ts`, `ops/commands/server/test.ts`, `ops/lib/process.ts`

**Current Code:**

The pattern `.replace('server/', '')` appears repeatedly:

```typescript
// ops/commands/server/config.ts:159
const configArg = wranglerPath.replace('server/', '')

// ops/commands/server/deploy.ts:17
const proc = Bun.spawn(['bun', 'run', 'wrangler', 'deploy', '-c', wranglerPath.replace('server/', '')], {

// ops/lib/process.ts:61
return wranglerPath.replace('server/', '')
```

**Why Change:**
- Magic string manipulation scattered across codebase
- Easy to forget the replacement and cause bugs
- The `getWranglerConfig()` in process.ts does this but isn't always used

**Improved Version:**

Add a function to config.ts that returns the path relative to server/:

```typescript
// ops/lib/config.ts

// Returns the wrangler config path for use with wrangler CLI (relative to server/)
export function getWranglerConfigArg(instance: string): string {
  return `wrangler.${instance}.toml`
}

// Returns the full path for file operations
export function getWranglerConfigPath(instance: string): string {
  return `server/wrangler.${instance}.toml`
}
```

Then update all usages to use the appropriate function.

**Priority:** MEDIUM - Reduces cognitive load and potential bugs

---

### 4. Separate Colors from Validation in colors.ts

**File:** `ops/lib/colors.ts` (25 lines)

**Current Code:**

```typescript
// ANSI color codes for terminal output
export const green = '\x1b[32m'
export const yellow = '\x1b[33m'
export const red = '\x1b[31m'
export const dim = '\x1b[2m'
export const reset = '\x1b[0m'

// Validation result type
export type ValidationResult = { passed: boolean; message: string }

// Create a validation result
export function check(condition: boolean, message: string): ValidationResult { ... }

// Print a validation result with icon
export function printResult(result: ValidationResult): void { ... }
```

**Why Change:**
- File name suggests only colors, but contains validation logic
- `ValidationResult` and `check()` are only used by config validation
- Mixing concerns makes the codebase harder to navigate

**Improved Version:**

Option A: Rename file to `output.ts` since it's about terminal output (colors + formatted results)

Option B: Move validation to config.ts where it's used:
```typescript
// ops/lib/colors.ts - just colors
export const green = '\x1b[32m'
export const yellow = '\x1b[33m'
export const red = '\x1b[31m'
export const dim = '\x1b[2m'
export const reset = '\x1b[0m'

// Helper for checkmark/cross output
export function printStatus(passed: boolean, message: string): void {
  const icon = passed ? `${green}[ok]${reset}` : `${red}[x]${reset}`
  console.log(`  ${icon} ${message}`)
}
```

**Priority:** LOW - Code clarity improvement

---

### 5. Remove Duplicate Auth Constants

**Files:** `ops/lib/config.ts`, `ops/commands/server/setup.ts`

**Current Code:**

```typescript
// ops/lib/config.ts:237-243
export const COMMON_AUTH_VARS = ['BETTER_AUTH_SECRET']
export const LOCAL_AUTH_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
export const CF_ACCESS_AUTH_VARS = ['CLOUDFLARE_ACCESS_TEAM']

// ops/commands/server/setup.ts:274-276
const AUTH_MODE_VARS = ['AUTH_MODE', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CLOUDFLARE_ACCESS_TEAM']
const LOCAL_AUTH_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
const CF_ACCESS_AUTH_VARS = ['CLOUDFLARE_ACCESS_TEAM']
```

**Why Change:**
- Same constants defined in two places
- Easy to update one and forget the other
- setup.ts shadows the exports from config.ts

**Improved Version:**

Remove the duplicates from setup.ts and import from config.ts:

```typescript
// ops/commands/server/setup.ts
import {
  LOCAL_AUTH_VARS,
  CF_ACCESS_AUTH_VARS,
  COMMON_AUTH_VARS,
} from '../../lib/config'

// Derive AUTH_MODE_VARS from the others
const AUTH_MODE_VARS = ['AUTH_MODE', ...COMMON_AUTH_VARS, ...LOCAL_AUTH_VARS, ...CF_ACCESS_AUTH_VARS]
```

**Priority:** MEDIUM - Prevents drift between validation and setup

---

### 6. Simplify the writeVarsFile Duplication

**Files:** `ops/lib/config.ts:22-29`, `ops/commands/server/setup.ts:118-124`

**Current Code:**

```typescript
// ops/lib/config.ts:22-29
export function writeVarsFile(path: string, vars: Map<string, string>): void {
  const lines: string[] = []
  for (const [name, value] of vars) {
    lines.push(`${name}=${value}`)
  }
  writeFileSync(path, lines.join('\n') + '\n')
}

// ops/commands/server/setup.ts:118-124 (same function, not exported from config)
function writeVarsFile(path: string, vars: Map<string, string>): void {
  const lines: string[] = []
  for (const [name, value] of vars) {
    lines.push(`${name}=${value}`)
  }
  writeFileSync(path, lines.join('\n') + '\n')
}
```

**Why Change:**
- Exact same function defined twice
- config.ts already exports it, setup.ts should import it

**Improved Version:**

Remove the local definition in setup.ts and import from config.ts:

```typescript
// ops/commands/server/setup.ts
import { writeVarsFile } from '../../lib/config'
```

**Priority:** HIGH - Simple fix, removes exact duplication

---

### 7. Standardize on Bun APIs Instead of Node APIs

**Files:** `ops/commands/commit.ts`, `ops/commands/pr.ts`, `ops/commands/release.ts`

**Current Code:**

These files use Node.js `execSync` and `spawnSync` while other files use `Bun.spawn`:

```typescript
// ops/commands/commit.ts:2
import { execSync } from 'child_process'

// ops/commands/pr.ts:2
import { execSync, spawnSync } from 'child_process'
```

**Why Change:**
- Inconsistent APIs across codebase
- Bun's spawn API is more ergonomic with async/await
- Mixing paradigms makes the code harder to understand

**Improved Version:**

Convert to Bun.spawn/Bun.spawnSync consistently. The main files using Node APIs are the git-related commands (commit, pr, release) which could all use the centralized utilities from recommendation #1.

**Priority:** LOW - Consistency improvement, not functional

---

### 8. Extract Database Command Pattern

**File:** `ops/commands/server/db.ts`

**Current Code:**

All four database functions (`dbTablesAction`, `dbQueryAction`, `dbMigrateAction`, `dbDropAllAction`) share the same boilerplate:

```typescript
const wranglerConfig = getWranglerConfig(instance)
const { dbName } = getInstanceResourceNames(instance)

const proc = Bun.spawn(
  ['bunx', 'wrangler', 'd1', 'execute', dbName, '-c', wranglerConfig, '--remote', ...],
  { cwd: 'server', stdout: 'pipe', stderr: 'pipe' }
)

const exitCode = await proc.exited
const stdout = await new Response(proc.stdout).text()
const stderr = await new Response(proc.stderr).text()

if (exitCode !== 0) {
  console.error(`Error: ${stderr}`)
  process.exit(1)
}
```

**Why Change:**
- Same pattern repeated 4+ times
- Error handling could be centralized
- Adding a new D1 command requires copying boilerplate

**Improved Version:**

```typescript
// ops/commands/server/db.ts

async function runD1Query(
  instance: string,
  args: string[],
  options?: { json?: boolean }
): Promise<string> {
  const wranglerConfig = getWranglerConfig(instance)
  const { dbName } = getInstanceResourceNames(instance)

  const fullArgs = [
    'bunx', 'wrangler', 'd1', 'execute', dbName,
    '-c', wranglerConfig, '--remote',
    ...(options?.json ? ['--json'] : []),
    ...args,
  ]

  const proc = Bun.spawn(fullArgs, {
    cwd: 'server',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr)
  }

  return stdout
}

// Usage becomes much cleaner:
export async function dbTablesAction(instance: string): Promise<void> {
  console.log(`Listing tables for ${instance} D1 database...\n`)
  const result = await runD1Query(instance, [
    '--command',
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`
  ])
  console.log(result)
}
```

**Priority:** MEDIUM - Reduces boilerplate, easier to add new commands

---

### 9. Add Error Handling to CLI Pass-through Commands

**File:** `ops/commands/cli.ts`

**Current Code:**

```typescript
async function runCliScript(script: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(['bun', 'run', script, ...args], {
    cwd: 'cli',
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })

  const exitCode = await proc.exited
  process.exit(exitCode)
}
```

**Why Change:**
- Silently exits with exit code, no message about what failed
- Hard to debug when script doesn't exist

**Improved Version:**

```typescript
async function runCliScript(script: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(['bun', 'run', script, ...args], {
    cwd: 'cli',
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    console.error(`\nScript '${script}' failed with exit code ${exitCode}`)
  }

  process.exit(exitCode)
}
```

**Priority:** LOW - Minor UX improvement

---

### 10. Consider Using a Test Framework for Integration Tests

**File:** `ops/commands/server/test.ts`

**Current Code:**

Custom test assertions using console.log and manual pass/fail tracking:

```typescript
let testPassed = true
// ...
if (response.ok && response.headers.get('content-type')?.startsWith('text/plain')) {
  console.log(`${green}[ok]${reset} .md served as text/plain`)
} else {
  console.error(`${red}[x]${reset} .md not served as text/plain: ${response.headers.get('content-type')}`)
  testPassed = false
}
```

**Why Change:**
- No test isolation - one failure doesn't stop other tests
- No automatic retry capability
- No parallel execution option
- Manual pass/fail tracking is error-prone
- No test timeouts

**Improved Version:**

Consider using Bun's built-in test runner with custom setup:

```typescript
// ops/commands/server/test/static-files.test.ts
import { describe, test, expect, beforeAll } from 'bun:test'
import { TestContext } from './context'

describe('Static file serving', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await TestContext.getInstance()
  })

  test('.md files are served as text/plain', async () => {
    const response = await fetch(`${ctx.projectUrl}/readme.md`)
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toStartWith('text/plain')
  })
})
```

**Priority:** LOW - Significant effort but would improve test reliability

---

## Summary by Priority

### HIGH Priority (Do First)
1. Consolidate process spawning utilities - 4 files affected
2. Split monolithic test file - 1124 lines to organize
6. Remove writeVarsFile duplication - Simple fix

### MEDIUM Priority
3. Centralize wrangler config path handling
5. Remove duplicate auth constants
8. Extract database command pattern

### LOW Priority
4. Separate colors from validation
7. Standardize on Bun APIs
9. Add error handling to CLI pass-through
10. Consider test framework for integration tests

---

## Estimated Impact

| Improvement | Lines Removed | Lines Added | Files Changed |
|-------------|---------------|-------------|---------------|
| #1 Process utilities | ~40 | ~20 | 5 |
| #2 Split test file | 0 | ~100 (structure) | 1 -> 12 |
| #3 Wrangler paths | ~10 | ~10 | 6 |
| #4 Colors/validation | ~5 | ~5 | 2 |
| #5 Auth constants | ~6 | ~2 | 2 |
| #6 writeVarsFile | ~7 | ~1 | 1 |
| #7 Bun APIs | ~20 | ~15 | 3 |
| #8 DB pattern | ~60 | ~30 | 1 |

Total estimated: ~150 lines of duplication removed, better organization, easier maintenance.
