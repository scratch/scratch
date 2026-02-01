# Plan: Convert Integration Tests to Bun's Test Framework

## Overview

This plan details how to convert `ops/commands/server/test.ts` from a custom manual testing approach to using Bun's built-in test framework (`bun:test`), while maintaining the sequential execution required by the integration test dependencies.

**Reference:** This implements recommendation #10 from `plan/simplify-ops.md`.

---

## 1. Current State Analysis

### File Structure

The file `ops/commands/server/test.ts` is 1124 lines consisting of:
- **Lines 1-21**: Imports and helper functions (`generateRandomProjectName`)
- **Lines 23-1123**: Single `integrationTestAction(instance: string)` function containing all test logic

### Test Sections and Dependencies

The tests are organized into numbered steps that MUST run sequentially because each step depends on artifacts from previous steps:

| Step | Name | Dependencies | Creates/Modifies |
|------|------|--------------|------------------|
| 1 | Build CLI | None | `CLI_BIN` executable |
| 2 | Run migrations | Step 1 | Database schema |
| 3 | Deploy server | Steps 1-2 | Deployed worker |
| 4 | Start log tail | Step 3 | `logsProcess` (background) |
| 5 | Login with CLI | Steps 1-3 | CLI credentials |
| 6 | Create scratch project | Steps 1, 5 | `tempDir`, test files |
| 7 | Deploy scratch project | Steps 1, 5, 6 | `projectName`, `deployedUrl` |
| 8 | Verify deployed content | Step 7 | None |
| 8b | Test static file serving | Step 7 | None (5 sub-tests) |
| 8c | Test enumeration prevention | Step 7 | None (2 sub-tests) |
| 8d | Test content token URL cleanup | Steps 5, 7 | `privateProjectName`, `privateTempDir` |
| 8d2 | Test share token URL cleanup | Steps 5, 7 | `shareTestProjectName`, `shareTestTempDir` |
| 8e | Test API token authentication | Steps 5, 7 | `tokenName`, `apiToken` (7 sub-tests) |
| 9 | Test project ID persistence | Steps 5, 7 | Modifies `project.toml` (3 sub-tests) |
| 10 | Test WWW domain serving | Steps 5, 7 | Modifies vars, redeploys |
| Cleanup | Delete test project | Steps 5, 7, 9 | None |

### Shared State (TestContext)

The following state is shared across tests:

```typescript
// From vars file
interface TestContext {
  instance: string
  baseDomain: string
  appDomain: string
  pagesDomain: string
  serverUrl: string
  vars: Map<string, string>
  varsPath: string

  // Created during test setup (Steps 1-7)
  tempDir: string
  projectName: string        // Original project name
  currentProjectName: string // May change if renamed in Step 9
  deployedUrl: string
  projectBaseUrl: string
  localContent: string  // From dist/index.html

  // For cleanup
  logsProcess: ReturnType<typeof Bun.spawn> | null

  // Credentials (populated after login)
  cliToken: string | null
}
```

**Note:** The `testPassed: boolean` field from the current implementation is NOT included in the target TestContext. The test framework's `expect()` assertions handle pass/fail tracking automatically.

### Current Pass/Fail Mechanism

Tests use a manual tracking pattern with unicode checkmarks:

```typescript
let testPassed = true

// Success case
if (response.ok) {
  console.log(`${green}✓${reset} Description`)
} else {
  console.error(`${red}✗${reset} Error description`)
  testPassed = false
}

// At end
if (testPassed) {
  console.log(`${green}✓${reset} Integration test passed!`)
} else {
  console.log(`${red}✗${reset} Integration test failed!`)
  process.exit(1)
}
```

---

## 2. Target Architecture

### Bun Test Framework Usage

We will use `bun:test` with the following patterns:

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
```

### Key Design Decisions

#### 2.1 Sequential Execution

By default, Bun runs tests within a single file sequentially (in order of definition). We do NOT need `--preload` or special configuration; tests in a single file run sequentially unless `describe.concurrent` or `--concurrent` is used.

**Important:** We will NOT use `describe.concurrent` or any concurrency flags.

**Note:** Bun v1.2.23 (September 2025) significantly improved the reliability of `describe` block and hook execution order. Ensure the project uses at least this version. Earlier versions had issues where nested describe blocks and hooks could execute in unexpected order.

#### 2.2 Shared Context via Module-Level Variables

Since tests run sequentially and we cannot pass state between `test()` blocks directly, we use module-level variables:

```typescript
// Module-level state (initialized in beforeAll)
let ctx: TestContext

beforeAll(async () => {
  ctx = await initializeTestContext(instance)
})

afterAll(async () => {
  await cleanup(ctx)
})
```

#### 2.3 Single File Structure (For Now)

Per the constraints, we keep everything in a single file (`test.ts`). This aligns with the recommendation to NOT split the file in this PR (that's recommendation #2).

#### 2.4 Console Output Preservation

Keep `console.log()` statements for visibility. The test framework output will be supplemented by our verbose logging.

### File Structure After Migration

```typescript
// ops/commands/server/test.ts

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { /* existing imports */ } from '...'

// --- Types ---
interface TestContext { ... }

// --- Module-level state ---
let ctx: TestContext

// Get instance from environment variable (set by integrationTestAction)
const instance = process.env.TEST_INSTANCE
if (!instance) {
  throw new Error('TEST_INSTANCE environment variable required. Run via: bun ops server -i <instance> test')
}

// --- Helper functions ---
function generateRandomProjectName(): string { ... }
async function initializeTestContext(inst: string): Promise<TestContext> { ... }
async function cleanup(ctx: TestContext): Promise<void> { ... }
function registerSigintHandler(ctx: TestContext): void { ... }

// --- Test runner entry point (called by CLI command) ---
export async function integrationTestAction(inst: string): Promise<void> {
  // Spawn bun test with TEST_INSTANCE env var
  const proc = Bun.spawn([
    'bun', 'test', 'ops/commands/server/test.ts',
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

// --- Test Suite ---
describe('Integration Tests', () => {
  beforeAll(async () => {
    ctx = await initializeTestContext(instance)
    registerSigintHandler(ctx)
  })

  afterAll(async () => {
    await cleanup(ctx)
  })

  describe('Setup', () => {
    test('Step 1: CLI builds successfully', async () => { ... })
    test('Step 2: Migrations run successfully', async () => { ... })
    // ... steps 3-7
  })

  describe('Step 8: Content verification', () => {
    test('deployed content matches local', async () => { ... })
  })

  // ... more describe blocks for each step
})
```

### How to Invoke Tests

The existing invocation via `bun ops server -i staging test` needs to work. Two options:

**Option A: Spawn bun test (Recommended)**

```typescript
export async function integrationTestAction(inst: string): Promise<void> {
  // Set instance via environment variable
  const proc = Bun.spawn([
    'bun', 'test', 'ops/commands/server/test.ts',
    '--timeout', '600000',  // 10 minute timeout for full suite
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

Then in the test file:
```typescript
const instance = process.env.TEST_INSTANCE
if (!instance) {
  throw new Error('TEST_INSTANCE environment variable required')
}
```

**Important Caveat:** There is a known issue where `Bun.spawn()` with `stdout: 'pipe'` can return empty output when run inside `bun test`. Since we use `stdout: 'inherit'`, this should not affect us, but be aware if you need to capture subprocess output within tests.

**Option B: Programmatic test execution**

This is more complex and less well-documented. Option A is simpler and leverages Bun's test runner directly.

---

## 3. Migration Strategy

### Phase 1: Preparation (Non-Breaking)

1. **Extract TestContext type** to top of file
2. **Extract `initializeTestContext()`** function from steps 1-7 setup logic
3. **Extract `cleanup()`** function from existing cleanup logic
4. **Verify existing tests still work** after refactoring

### Phase 2: Convert to Test Framework

1. **Add bun:test imports**
2. **Wrap existing code in describe/test blocks**
3. **Convert pass/fail tracking to expect() assertions**
4. **Update `integrationTestAction()` to spawn bun test**

### Phase 3: Verification

1. Run full test suite against staging
2. Verify all tests pass
3. Verify console output is still visible
4. Verify cleanup runs on success and failure

### Conversion Order

Convert tests in dependency order (same as execution order):

1. Steps 1-7 (setup) - Convert to tests within a `describe('Setup', ...)` block
   - These ARE tests (not just `beforeAll`) because we want visibility into their success/failure
   - The `beforeAll` hook should only initialize the TestContext with configuration values
2. Step 8 (content verification) - First verification test
3. Step 8b (static file serving - 5 tests)
4. Step 8c (enumeration prevention - 2 tests)
5. Step 8d (content token URL cleanup)
6. Step 8d2 (share token URL cleanup)
7. Step 8e (API token authentication - 7 tests)
8. Step 9 (project ID persistence - 3 tests)
9. Step 10 (WWW domain serving)
10. Cleanup - Convert to `afterAll`

**Important:** The cleanup must track whether the project was renamed in Step 9, so the TestContext should include a `currentProjectName` field that gets updated when the rename occurs.

---

## 4. Specific Code Examples

### Example 1: Before/After for Static File Serving (Step 8b)

**Before (Current):**
```typescript
// Step 8b: Test static file serving (MIME types and .mdx redirect)
console.log('Step 8b: Testing static file serving...')

// Test 1: .md file served as text/plain
const mdUrl = `${projectBaseUrl}/readme.md`
const mdResponse = await fetch(mdUrl)
if (mdResponse.ok && mdResponse.headers.get('content-type')?.startsWith('text/plain')) {
  console.log(`${green}✓${reset} .md served as text/plain`)
} else {
  console.error(`${red}✗${reset} .md not served as text/plain: ${mdResponse.headers.get('content-type')}`)
  testPassed = false
}

// Test 2: .txt file served as text/plain
const txtUrl = `${projectBaseUrl}/notes.txt`
const txtResponse = await fetch(txtUrl)
if (txtResponse.ok && txtResponse.headers.get('content-type')?.startsWith('text/plain')) {
  console.log(`${green}✓${reset} .txt served as text/plain`)
} else {
  console.error(`${red}✗${reset} .txt not served as text/plain: ${txtResponse.headers.get('content-type')}`)
  testPassed = false
}
```

**After (With bun:test):**
```typescript
describe('Step 8b: Static file serving', () => {
  test('.md files are served as text/plain', async () => {
    const mdUrl = `${ctx.projectBaseUrl}/readme.md`
    console.log(`Fetching: ${mdUrl}`)

    const response = await fetch(mdUrl)

    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toStartWith('text/plain')
    console.log(`${green}✓${reset} .md served as text/plain`)
  })

  test('.txt files are served as text/plain', async () => {
    const txtUrl = `${ctx.projectBaseUrl}/notes.txt`
    console.log(`Fetching: ${txtUrl}`)

    const response = await fetch(txtUrl)

    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toStartWith('text/plain')
    console.log(`${green}✓${reset} .txt served as text/plain`)
  })

  test('.mdx URL redirects to .md', async () => {
    const mdxUrl = `${ctx.projectBaseUrl}/source.mdx`
    console.log(`Fetching: ${mdxUrl}`)

    const response = await fetch(mdxUrl, { redirect: 'manual' })

    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toEndWith('/source.md')
    console.log(`${green}✓${reset} .mdx redirects to .md`)
  })

  test('.mdx redirect serves correct content', async () => {
    const mdxUrl = `${ctx.projectBaseUrl}/source.mdx`

    const response = await fetch(mdxUrl, { redirect: 'follow' })

    expect(response.ok).toBe(true)
    const content = await response.text()
    expect(content).toMatch(/MDX Source|Hello world from source\.mdx/)
    console.log(`${green}✓${reset} .mdx redirect serves correct content`)
  })

  test('compiled HTML page is accessible', async () => {
    const htmlUrl = `${ctx.projectBaseUrl}/source/`

    const response = await fetch(htmlUrl)

    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toInclude('text/html')
    console.log(`${green}✓${reset} Compiled HTML page still accessible`)
  })
})
```

### Example 2: Before/After for Enumeration Prevention (Step 8c)

**Before (Current):**
```typescript
// Step 8c: Test project enumeration prevention
console.log('Step 8c: Testing project enumeration prevention...')

const nonExistentUrl = `https://${pagesDomain}/nonexistent-user-12345/nonexistent-project-67890/`
const enumResponse = await fetch(nonExistentUrl, { redirect: 'manual' })

if (enumResponse.status === 302 || enumResponse.status === 303) {
  const location = enumResponse.headers.get('location') || ''
  if (location.includes('/auth/content-access')) {
    console.log(`${green}✓${reset} Non-existent project redirects to auth (prevents enumeration)`)
  } else {
    console.error(`${red}✗${reset} Non-existent project redirects but not to auth: ${location}`)
    testPassed = false
  }
} else if (enumResponse.status === 404) {
  console.error(`${red}✗${reset} Non-existent project returns 404 (allows enumeration attack)`)
  testPassed = false
} else {
  console.error(`${red}✗${reset} Unexpected status for non-existent project: ${enumResponse.status}`)
  testPassed = false
}
```

**After (With bun:test):**
```typescript
describe('Step 8c: Enumeration prevention', () => {
  test('non-existent project redirects to auth (prevents enumeration)', async () => {
    const nonExistentUrl = `https://${ctx.pagesDomain}/nonexistent-user-12345/nonexistent-project-67890/`
    console.log(`Fetching: ${nonExistentUrl}`)

    const response = await fetch(nonExistentUrl, { redirect: 'manual' })

    // Should redirect (302 or 303), NOT return 404
    expect([302, 303]).toContain(response.status)

    const location = response.headers.get('location') || ''
    expect(location).toInclude('/auth/content-access')

    console.log(`${green}✓${reset} Non-existent project redirects to auth (prevents enumeration)`)
  })

  test('public project serves content directly (no redirect)', async () => {
    const response = await fetch(ctx.deployedUrl, { redirect: 'manual' })

    // Public project should serve directly or do trailing slash redirect
    if (response.status === 301) {
      // Follow the redirect and check final response
      const redirectedUrl = response.headers.get('location')!
      const finalResponse = await fetch(redirectedUrl, { redirect: 'manual' })
      expect(finalResponse.status).toBe(200)
      console.log(`${green}✓${reset} Public project serves content directly (after slash redirect)`)
    } else {
      expect(response.status).toBe(200)
      console.log(`${green}✓${reset} Public project serves content directly`)
    }
  })
})
```

### Example 3: TestContext Structure

```typescript
interface TestContext {
  // Configuration (from vars file)
  instance: string
  baseDomain: string
  appDomain: string
  pagesDomain: string
  serverUrl: string
  vars: Map<string, string>
  varsPath: string

  // Created during setup
  tempDir: string
  projectName: string        // Original project name
  currentProjectName: string // Updated if renamed in Step 9
  deployedUrl: string
  projectBaseUrl: string
  localContent: string

  // Background processes
  logsProcess: ReturnType<typeof Bun.spawn> | null

  // Credentials (populated after login)
  cliToken: string | null
}

async function initializeTestContext(instance: string): Promise<TestContext> {
  console.log(`Initializing test context for instance: ${instance}`)

  // Read vars file
  const varsPath = getInstanceVarsPath(instance)
  if (!existsSync(varsPath)) {
    throw new Error(`${varsPath} not found. Run: bun ops server -i ${instance} setup`)
  }

  const vars = parseVarsFile(varsPath)
  const baseDomain = vars.get('BASE_DOMAIN')!
  const appSubdomain = vars.get('APP_SUBDOMAIN')!
  const contentSubdomain = vars.get('CONTENT_SUBDOMAIN')!

  if (!baseDomain || !appSubdomain || !contentSubdomain) {
    throw new Error('Missing required vars (BASE_DOMAIN, APP_SUBDOMAIN, CONTENT_SUBDOMAIN)')
  }

  const appDomain = `${appSubdomain}.${baseDomain}`
  const pagesDomain = `${contentSubdomain}.${baseDomain}`
  const serverUrl = `https://${appDomain}`

  const projectName = generateRandomProjectName()
  const tempDir = join(tmpdir(), `scratch-${instance}-test-${Date.now()}`)

  return {
    instance,
    baseDomain,
    appDomain,
    pagesDomain,
    serverUrl,
    vars,
    varsPath,
    tempDir,
    projectName,
    currentProjectName: projectName, // Updated if renamed in Step 9
    deployedUrl: '',      // Set after deployment
    projectBaseUrl: '',   // Set after deployment
    localContent: '',     // Set after build
    logsProcess: null,    // Set when starting logs
    cliToken: null,       // Set after login
  }
}

async function cleanup(ctx: TestContext): Promise<void> {
  console.log('Running cleanup...')

  // Stop log tail process
  if (ctx.logsProcess) {
    ctx.logsProcess.kill()
    ctx.logsProcess = null
    // Reset terminal settings
    Bun.spawnSync(['stty', 'sane'], { stdin: 'inherit' })
    console.log('Stopped log tail')
  }

  // Delete test project if it was created (use currentProjectName in case it was renamed)
  if (ctx.currentProjectName) {
    console.log(`Deleting test project: ${ctx.currentProjectName}...`)
    const result = await runCommand([
      CLI_BIN, 'projects', 'delete', ctx.currentProjectName, ctx.serverUrl, '--force'
    ])
    if (result.exitCode === 0) {
      console.log(`${green}✓${reset} Test project deleted`)
    } else {
      console.log(`${yellow}!${reset} Could not delete test project (may need manual cleanup)`)
    }
  }

  // Cleanup temp directory
  try {
    await rm(ctx.tempDir, { recursive: true, force: true })
    console.log(`Cleaned up temp directory: ${ctx.tempDir}`)
  } catch {
    // Ignore cleanup errors
  }
}

// SIGINT handler for Ctrl-C - call cleanup and exit
// Register this in beforeAll alongside ctx initialization
function registerSigintHandler(ctx: TestContext): void {
  const handler = async () => {
    console.log('\n\nInterrupted, cleaning up...')
    await cleanup(ctx)
    process.exit(1)
  }
  process.on('SIGINT', handler)
}
```

**Note:** While `afterAll` should run on test failures, it may NOT run on Ctrl-C interrupts. The SIGINT handler ensures cleanup happens in that case. Register it in `beforeAll` after context initialization.

### Example 4: Setup Tests (Steps 1-7)

These setup steps become tests themselves (not just `beforeAll`) because we want visibility into their success/failure:

```typescript
describe('Setup', () => {
  test('Step 1: CLI builds successfully', async () => {
    console.log('Step 1: Building CLI...')

    const exitCode = await runCommandInherit(['bun', 'ops', 'cli', 'build'])

    expect(exitCode).toBe(0)
    console.log(`${green}✓${reset} CLI built successfully`)
  })

  test('Step 2: Migrations run successfully', async () => {
    console.log(`Step 2: Running ${ctx.instance} migrations...`)

    const exitCode = await runCommandInherit([
      'bun', 'ops', 'server', '-i', ctx.instance, 'db', 'migrate'
    ])

    expect(exitCode).toBe(0)
    console.log(`${green}✓${reset} Migrations complete`)
  })

  test('Step 3: Server deploys successfully', async () => {
    console.log(`Step 3: Deploying server to ${ctx.instance}...`)

    const exitCode = await runCommandInherit([
      'bun', 'ops', 'server', '-i', ctx.instance, 'deploy'
    ])

    expect(exitCode).toBe(0)
    console.log(`${green}✓${reset} Server deployed`)
  })

  test('Step 4: Log tail starts', async () => {
    console.log('Step 4: Starting log tail...')

    const wranglerConfig = getWranglerConfig(ctx.instance)
    ctx.logsProcess = Bun.spawn(
      ['bun', 'run', 'wrangler', 'tail', '-c', wranglerConfig, '--format', 'pretty'],
      { cwd: 'server', stdout: 'inherit', stderr: 'inherit' }
    )

    // Process started (we don't wait for it to complete)
    expect(ctx.logsProcess).toBeTruthy()
    console.log(`${green}✓${reset} Log tail started`)
  })

  test('Step 5: CLI login succeeds', async () => {
    console.log('Step 5: Logging in with CLI...')

    const whoamiResult = await runCommand([CLI_BIN, 'whoami', ctx.serverUrl])

    if (whoamiResult.stdout.includes('Not logged in')) {
      console.log('Not logged in. Please complete login in browser...')
      const exitCode = await runCommandInherit([
        CLI_BIN, 'login', ctx.serverUrl, '--timeout', '0.25'
      ])
      expect(exitCode).toBe(0)
    } else {
      console.log(`Already logged in: ${whoamiResult.stdout.trim()}`)
    }

    // Read credentials for later use
    const credentialsPath = join(process.env.HOME || '~', '.scratch', 'credentials.json')
    try {
      const credentials = JSON.parse(await readFile(credentialsPath, 'utf-8'))
      for (const [server, creds] of Object.entries(credentials)) {
        if (server.includes(ctx.appDomain)) {
          ctx.cliToken = (creds as { token: string }).token
          break
        }
      }
    } catch {
      // Will be handled in tests that need it
    }

    console.log(`${green}✓${reset} Logged in`)
  })

  test('Step 6: Project creates successfully', async () => {
    console.log(`Step 6: Creating scratch project in ${ctx.tempDir}...`)

    const exitCode = await runCommandInherit([CLI_BIN, 'create', ctx.tempDir])
    expect(exitCode).toBe(0)

    // Add test files
    await writeFile(join(ctx.tempDir, 'pages', 'source.mdx'), '# MDX Source\n\nHello world from source.mdx')
    await writeFile(join(ctx.tempDir, 'pages', 'notes.txt'), 'Plain text notes')
    await writeFile(join(ctx.tempDir, 'pages', 'readme.md'), '# Readme\n\nDocumentation')

    console.log(`${green}✓${reset} Project created with test files`)
  })

  test('Step 7: Project deploys successfully', async () => {
    console.log(`Step 7: Deploying project "${ctx.projectName}" to ${ctx.instance}...`)

    const result = await runCommand([
      CLI_BIN, 'publish', ctx.tempDir,
      '--server', ctx.serverUrl,
      '--visibility', 'public',
      '--name', ctx.projectName,
      '--no-open',
    ])

    expect(result.exitCode).toBe(0)
    console.log(result.stdout)

    // Extract deployed URL
    const urlMatch = result.stdout.match(/URLs:\s+(\S+)/)
    ctx.deployedUrl = urlMatch ? urlMatch[1] : `https://${ctx.pagesDomain}/${ctx.projectName}/`
    ctx.projectBaseUrl = ctx.deployedUrl.replace(/\/$/, '')

    // Read local content for comparison
    const localIndexPath = join(ctx.tempDir, 'dist', 'index.html')
    ctx.localContent = await readFile(localIndexPath, 'utf-8')

    console.log(`${green}✓${reset} Project deployed`)
  })
})
```

---

## 5. Risk Mitigation

### What Could Go Wrong

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tests run in wrong order | High - cascading failures | Use single `describe` block, verify test order in output |
| Context not shared properly | High - tests fail unexpectedly | Use module-level `ctx` variable, verify in each test |
| Cleanup doesn't run on failure | Medium - orphaned resources | Use `afterAll` which runs even if tests fail; additionally register SIGINT handler for Ctrl-C |
| Console output suppressed | Low - harder to debug | Keep all `console.log()` statements, use `--verbose` flag if needed |
| Timeout issues | Medium - false failures | Set generous timeout (10 minutes) for full suite |
| bun:test API changes | Low - future maintenance | Pin Bun version, test on CI |

### Verification Steps

1. **Before migration:**
   - Run existing tests: `bun ops server -i staging test`
   - Note all passing/failing tests and output format

2. **After migration:**
   - Run converted tests: `bun ops server -i staging test`
   - Verify same tests pass/fail
   - Verify console output is still visible and informative
   - Verify cleanup runs (check for orphaned projects)
   - Run directly with bun test to verify: `TEST_INSTANCE=staging bun test ops/commands/server/test.ts --timeout 600000`

3. **Edge cases to test:**
   - Interrupt with Ctrl-C (should cleanup)
   - Test with already-logged-in user
   - Test with not-logged-in user
   - Test with share tokens disabled

4. **Verify bun version:**
   - Ensure bun version is >= 1.2.23 for reliable describe block/hook ordering

### Rollback Strategy

1. Keep the original file as `test.ts.bak` during development
2. The migration can be done in a single PR
3. If issues arise, revert the PR entirely
4. No database migrations or external changes required

---

## 6. Implementation Checklist

### Pre-Work
- [ ] Read this plan completely
- [ ] Verify bun version >= 1.2.23 (`bun --version`)
- [ ] Verify `bun ops server -i staging test` works before starting
- [ ] Create backup of `test.ts`

### Phase 1: Preparation
- [ ] Define `TestContext` interface at top of file
- [ ] Extract `initializeTestContext()` function
- [ ] Extract `cleanup()` function
- [ ] Verify tests still work after extraction

### Phase 2: Conversion
- [ ] Add `bun:test` imports
- [ ] Create outer `describe('Integration Tests', ...)` block
- [ ] Add `beforeAll` for reading instance from env and initializing TestContext
- [ ] Register SIGINT handler in `beforeAll` for Ctrl-C cleanup
- [ ] Convert Steps 1-7 to setup tests in `describe('Setup', ...)`
- [ ] Convert Step 8 (content verification)
- [ ] Convert Step 8b (static file serving - 5 tests)
- [ ] Convert Step 8c (enumeration prevention - 2 tests)
- [ ] Convert Step 8d (content token URL cleanup)
- [ ] Convert Step 8d2 (share token URL cleanup)
- [ ] Convert Step 8e (API token authentication - 7 tests)
- [ ] Convert Step 9 (project ID persistence - 3 tests) - Update `ctx.currentProjectName` on rename
- [ ] Convert Step 10 (WWW domain serving)
- [ ] Add `afterAll` for cleanup
- [ ] Update `integrationTestAction()` to spawn `bun test`

### Phase 3: Verification
- [ ] Run full test suite against staging
- [ ] Verify all tests pass
- [ ] Verify console output is visible
- [ ] Test Ctrl-C interrupt (cleanup should run)
- [ ] Remove backup file

---

## 7. Estimated Effort

| Task | Estimated Time |
|------|----------------|
| Phase 1: Preparation | 1 hour |
| Phase 2: Conversion | 3-4 hours |
| Phase 3: Verification | 1-2 hours |
| **Total** | **5-7 hours** |

---

## 8. Future Considerations (Out of Scope)

These items are explicitly NOT part of this plan but noted for future reference:

1. **Splitting into multiple files** - This is recommendation #2 in `simplify-ops.md`. Do this AFTER the test framework conversion is stable.

2. **Parallel test execution** - Some test groups (8b, 8c) could theoretically run in parallel, but the complexity is not worth it given the current sequential dependencies.

3. **Test fixtures** - Could pre-create test projects and reuse them across runs, but this adds complexity around cleanup and state management.

4. **Retry logic** - Could add retry for flaky network operations, but should address root cause instead.

---

## 9. Review Notes

**Last reviewed:** 2026-02-01

### Issues Found and Corrected

1. **Sequential execution claim clarification** - Added note about Bun v1.2.23 requirement for reliable describe/hook ordering. Earlier versions had known issues.

2. **Missing `currentProjectName` field** - Added to TestContext to track project name changes after Step 9 rename. The cleanup function now uses this field.

3. **Inconsistent output format** - Changed `[ok]`/`[x]` to unicode checkmarks (`✓`/`✗`) to match actual source code.

4. **File structure example improved** - Fixed the example to show environment variable usage (not module-level variable assignment) for the `instance` value, consistent with the recommended spawn approach.

5. **SIGINT handler added** - Added `registerSigintHandler()` function and documentation to ensure cleanup runs on Ctrl-C, since `afterAll` may not be invoked in that case.

6. **Conversion order clarified** - Updated to show Steps 1-7 become tests in a `describe('Setup', ...)` block, not `beforeAll` hooks. The `beforeAll` should only initialize configuration.

7. **Spawn implementation corrected** - Changed from `runCommandInherit` helper to direct `Bun.spawn` call for clarity and added the known caveat about `stdout: 'pipe'` issues.

8. **Bun version verification added** - Added checklist item to verify bun version before starting.

### Verified Correct

1. **Sequential execution is guaranteed** - Bun does run tests sequentially by default within a single file (confirmed by documentation).

2. **TestContext sharing approach** - Module-level variable pattern will work correctly with sequential execution.

3. **Spawn approach for CLI invocation** - This is the correct approach; programmatic test execution in Bun is not well-documented.

4. **Test counts** - All test sections from the original file are accounted for in the conversion order.

### Potential Concerns (Not Blocking)

1. **`Bun.spawn()` within tests** - There is a known issue with `stdout: 'pipe'` returning empty output when run inside `bun test`. This affects tests that need to capture subprocess output (e.g., deploy output parsing). Mitigation: use `runCommand` helper which handles this, or restructure tests to avoid capturing output.
