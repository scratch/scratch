import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'child_process'
import path from 'path'

/**
 * Tests for the --www flag in the publish command.
 *
 * These tests verify:
 * 1. The --www flag is recognized by the CLI
 * 2. The flag is documented in help output
 */

const scratchPath = path.resolve(import.meta.dir, '../../../dist/scratch')

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(scratchPath, args, {
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status || 0,
  }
}

describe('publish --www flag', () => {
  test('publish help shows --www flag', () => {
    const result = runCli(['publish', '--help'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--www')
    expect(result.stdout).toContain('naked domain')
  })

  test('publish help shows --www description about base path', () => {
    const result = runCli(['publish', '--help'])
    expect(result.status).toBe(0)
    // The help should mention that --www publishes for serving at the naked domain
    expect(result.stdout).toMatch(/--www.*no base path|--www.*naked domain/i)
  })
})

describe('publish flag combinations', () => {
  test('publish help shows all expected flags', () => {
    const result = runCli(['publish', '--help'])
    expect(result.status).toBe(0)

    // Verify all publish flags are present
    expect(result.stdout).toContain('--server <url>')
    expect(result.stdout).toContain('--name <name>')
    expect(result.stdout).toContain('--visibility')
    expect(result.stdout).toContain('--no-build')
    expect(result.stdout).toContain('--no-open')
    expect(result.stdout).toContain('--dry-run')
    expect(result.stdout).toContain('--www')
  })
})
