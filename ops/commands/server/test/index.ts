// Integration test entry point - orchestrates all test modules
// Uses bun:test framework

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

// Get instance from environment variable (set by integrationTestAction)
const instance = process.env.TEST_INSTANCE

// --- Test Suite ---
// Only define tests when TEST_INSTANCE is set (i.e., when invoked via bun test)
// This prevents "Cannot use describe outside of the test runner" errors when
// the file is imported by other modules (e.g., during `bun ops cli build`)
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

// --- Test runner entry point (called by CLI command) ---
export async function integrationTestAction(inst: string): Promise<void> {
  // Spawn bun test with TEST_INSTANCE env var
  // Note: Use ./ prefix to treat path as a file path (not a filter pattern)
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
