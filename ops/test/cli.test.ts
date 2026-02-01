import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { runCliScript } from '../commands/cli'
import { join } from 'path'
import { existsSync } from 'fs'

// Get the repo root - tests run from ops/ so we go up one level
const repoRoot = join(__dirname, '../..')
const cliDir = join(repoRoot, 'cli')

describe('runCliScript', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>
  let exitSpy: ReturnType<typeof spyOn>
  let exitCode: number | undefined
  let originalCwd: string

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})
    exitCode = undefined
    exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
      exitCode = code ?? 0
      throw new Error(`process.exit(${code})`)
    })
    // runCliScript uses cwd: 'cli' relative to process.cwd()
    // Ensure we're running from the repo root
    originalCwd = process.cwd()
    process.chdir(repoRoot)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    exitSpy.mockRestore()
    process.chdir(originalCwd)
  })

  test('cli directory exists', () => {
    expect(existsSync(cliDir)).toBe(true)
  })

  test('prints error message when script fails', async () => {
    // Using a nonexistent script will cause bun run to fail
    try {
      await runCliScript('nonexistent-script-that-does-not-exist', [])
    } catch (e) {
      // Expected: process.exit was called
    }

    // Verify that exit was called with a non-zero code
    expect(exitCode).not.toBe(0)
    expect(exitCode).not.toBeUndefined()

    // Verify error message was printed
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Script 'nonexistent-script-that-does-not-exist' failed with exit code")
    )
  })
})
