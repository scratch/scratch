import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { green, yellow, red, dim, reset, printStatus } from '../lib/output'

describe('ANSI color constants', () => {
  test('green is correct ANSI code', () => {
    expect(green).toBe('\x1b[32m')
  })

  test('yellow is correct ANSI code', () => {
    expect(yellow).toBe('\x1b[33m')
  })

  test('red is correct ANSI code', () => {
    expect(red).toBe('\x1b[31m')
  })

  test('dim is correct ANSI code', () => {
    expect(dim).toBe('\x1b[2m')
  })

  test('reset is correct ANSI code', () => {
    expect(reset).toBe('\x1b[0m')
  })
})

describe('printStatus', () => {
  let consoleSpy: ReturnType<typeof spyOn>
  let loggedMessages: string[]

  beforeEach(() => {
    loggedMessages = []
    consoleSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      loggedMessages.push(args.join(' '))
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  test('prints success with green checkmark when passed is true', () => {
    printStatus(true, 'Test passed')

    expect(loggedMessages).toHaveLength(1)
    expect(loggedMessages[0]).toContain(green)
    expect(loggedMessages[0]).toContain('Test passed')
    expect(loggedMessages[0]).toContain(reset)
  })

  test('prints failure with red X when passed is false', () => {
    printStatus(false, 'Test failed')

    expect(loggedMessages).toHaveLength(1)
    expect(loggedMessages[0]).toContain(red)
    expect(loggedMessages[0]).toContain('Test failed')
    expect(loggedMessages[0]).toContain(reset)
  })

  test('includes checkmark character for success', () => {
    printStatus(true, 'Success message')

    expect(loggedMessages[0]).toMatch(/✓/)
  })

  test('includes X character for failure', () => {
    printStatus(false, 'Failure message')

    expect(loggedMessages[0]).toMatch(/✗/)
  })

  test('indents message with two spaces', () => {
    printStatus(true, 'Indented message')

    expect(loggedMessages[0]).toMatch(/^  /)
  })

  test('handles empty message', () => {
    printStatus(true, '')

    expect(loggedMessages).toHaveLength(1)
    expect(loggedMessages[0]).toContain(green)
  })

  test('handles message with special characters', () => {
    const specialMessage = 'Path: /some/path & value=123'
    printStatus(true, specialMessage)

    expect(loggedMessages[0]).toContain(specialMessage)
  })
})
