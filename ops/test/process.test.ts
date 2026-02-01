import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { run, runCapture } from '../lib/process'

describe('runCapture', () => {
  test('returns trimmed output', () => {
    // echo adds a newline, runCapture should trim it
    const result = runCapture(['echo', '  hello world  '])
    expect(result).toBe('hello world')
  })

  test('works with command as string', () => {
    const result = runCapture('echo hello')
    expect(result).toBe('hello')
  })

  test('works with command as array', () => {
    const result = runCapture(['echo', 'hello'])
    expect(result).toBe('hello')
  })

  test('throws on non-zero exit code', () => {
    expect(() => {
      // Use a command that will fail
      runCapture(['ls', '/nonexistent-directory-that-does-not-exist'])
    }).toThrow()
  })

  test('works with cwd option', () => {
    const testDir = join(tmpdir(), `process-test-cwd-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, 'test.txt'), 'test content')

    try {
      const result = runCapture(['ls', 'test.txt'], { cwd: testDir })
      expect(result).toBe('test.txt')
    } finally {
      rmSync(testDir, { recursive: true })
    }
  })
})

describe('run', () => {
  let consoleSpy: ReturnType<typeof spyOn>
  let exitSpy: ReturnType<typeof spyOn>
  let exitCode: number | undefined

  beforeEach(() => {
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {})
    exitCode = undefined
    exitSpy = spyOn(process, 'exit').mockImplementation((code?: number) => {
      exitCode = code ?? 0
      throw new Error(`process.exit(${code})`)
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    exitSpy.mockRestore()
  })

  test('echoes command by default', () => {
    run('echo hello')
    expect(consoleSpy).toHaveBeenCalledWith('$ echo hello')
  })

  test('does not echo when echo is false', () => {
    run('echo hello', { echo: false })
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  test('exits with correct exit code on failure', () => {
    expect(() => {
      // Use bash -c to run a shell command that exits with a specific code
      run(['bash', '-c', 'exit 42'])
    }).toThrow('process.exit(42)')
    expect(exitCode).toBe(42)
  })

  test('does not exit on success', () => {
    run('echo hello', { echo: false })
    expect(exitCode).toBeUndefined()
  })

  test('works with command as string', () => {
    run('echo hello', { echo: false })
    expect(exitCode).toBeUndefined()
  })

  test('works with command as array', () => {
    run(['echo', 'hello'], { echo: false })
    expect(exitCode).toBeUndefined()
  })

  test('echoes array commands as joined string', () => {
    run(['echo', 'hello', 'world'])
    expect(consoleSpy).toHaveBeenCalledWith('$ echo hello world')
  })

  test('works with cwd option', () => {
    const testDir = join(tmpdir(), `process-test-run-cwd-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, 'test.txt'), 'test content')

    try {
      // This should succeed (file exists in testDir)
      run(['ls', 'test.txt'], { cwd: testDir, echo: false })
      expect(exitCode).toBeUndefined()
    } finally {
      rmSync(testDir, { recursive: true })
    }
  })

  test('works with stdin option', () => {
    // With stdin: true (default), stdin is inherited
    // With stdin: false, stdin is undefined (not connected)
    // We test that the command still executes with stdin: false
    run('echo hello', { stdin: false, echo: false })
    expect(exitCode).toBeUndefined()
  })
})
