import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import * as processModule from '../lib/process'
import * as configModule from '../lib/config'

// We need to test runD1Query which is exported from db.ts
// Since it uses Bun.spawn, we'll need to mock it

describe('runD1Query', () => {
  let getWranglerConfigSpy: ReturnType<typeof spyOn>
  let getInstanceResourceNamesSpy: ReturnType<typeof spyOn>
  let originalBunSpawn: typeof Bun.spawn

  beforeEach(() => {
    // Store original Bun.spawn
    originalBunSpawn = Bun.spawn

    // Mock getWranglerConfig to return a test config path
    getWranglerConfigSpy = spyOn(processModule, 'getWranglerConfig').mockReturnValue('wrangler.test.toml')

    // Mock getInstanceResourceNames to return test resource names
    getInstanceResourceNamesSpy = spyOn(configModule, 'getInstanceResourceNames').mockReturnValue({
      workerName: 'test-scratch-server',
      bucketName: 'test-scratch-files',
      dbName: 'test-scratch-db',
    })
  })

  afterEach(() => {
    getWranglerConfigSpy.mockRestore()
    getInstanceResourceNamesSpy.mockRestore()
    // Restore original Bun.spawn
    Bun.spawn = originalBunSpawn
  })

  test('builds correct command for basic query', async () => {
    let capturedArgs: string[] = []

    // Create a mock that captures the arguments and returns a successful result
    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (args: string[], _options?: object) => {
      capturedArgs = args as string[]
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('query result'))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    // Import dynamically to pick up the mocks
    const { runD1Query } = await import('../commands/server/db')

    await runD1Query('test', ['--command', 'SELECT * FROM users'])

    expect(capturedArgs).toEqual([
      'bunx', 'wrangler', 'd1', 'execute', 'test-scratch-db',
      '-c', 'wrangler.test.toml', '--remote',
      '--command', 'SELECT * FROM users',
    ])
  })

  test('adds --json flag when json option is true', async () => {
    let capturedArgs: string[] = []

    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (args: string[], _options?: object) => {
      capturedArgs = args as string[]
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"result": []}'))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    await runD1Query('test', ['--command', 'SELECT * FROM users'], { json: true })

    expect(capturedArgs).toContain('--json')
    // --json should come before the additional args
    const jsonIndex = capturedArgs.indexOf('--json')
    const commandIndex = capturedArgs.indexOf('--command')
    expect(jsonIndex).toBeLessThan(commandIndex)
  })

  test('does not add --json flag when json option is false or undefined', async () => {
    let capturedArgs: string[] = []

    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (args: string[], _options?: object) => {
      capturedArgs = args as string[]
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('result'))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    // Test with json: false
    await runD1Query('test', ['--command', 'SELECT 1'], { json: false })
    expect(capturedArgs).not.toContain('--json')

    // Test with no options
    await runD1Query('test', ['--command', 'SELECT 1'])
    expect(capturedArgs).not.toContain('--json')
  })

  test('returns stdout on success', async () => {
    const expectedOutput = 'Table: users\nid | name\n1  | Alice'

    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (_args: string[], _options?: object) => {
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(expectedOutput))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    const result = await runD1Query('test', ['--command', 'SELECT * FROM users'])

    expect(result).toBe(expectedOutput)
  })

  test('throws error with stderr message on non-zero exit code', async () => {
    const errorMessage = 'Error: no such table: nonexistent'

    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (_args: string[], _options?: object) => {
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(errorMessage))
            controller.close()
          }
        }),
        exited: Promise.resolve(1),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    await expect(runD1Query('test', ['--command', 'SELECT * FROM nonexistent'])).rejects.toThrow(errorMessage)
  })

  test('uses correct cwd option (server directory)', async () => {
    let capturedOptions: { cwd?: string } = {}

    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (_args: string[], options?: object) => {
      capturedOptions = options as { cwd?: string }
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('result'))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    await runD1Query('test', ['--command', 'SELECT 1'])

    expect(capturedOptions.cwd).toBe('server')
  })

  test('calls getWranglerConfig with correct instance', async () => {
    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (_args: string[], _options?: object) => {
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('result'))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    await runD1Query('staging', ['--command', 'SELECT 1'])

    expect(getWranglerConfigSpy).toHaveBeenCalledWith('staging')
  })

  test('calls getInstanceResourceNames with correct instance', async () => {
    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (_args: string[], _options?: object) => {
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('result'))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    await runD1Query('prod', ['--command', 'SELECT 1'])

    expect(getInstanceResourceNamesSpy).toHaveBeenCalledWith('prod')
  })

  test('handles --file argument correctly', async () => {
    let capturedArgs: string[] = []

    // @ts-expect-error - mocking Bun.spawn
    Bun.spawn = (args: string[], _options?: object) => {
      capturedArgs = args as string[]
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('migrations applied'))
            controller.close()
          }
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          }
        }),
        exited: Promise.resolve(0),
      }
    }

    const { runD1Query } = await import('../commands/server/db')

    await runD1Query('test', ['--file', 'src/db/schema.sql'])

    expect(capturedArgs).toContain('--file')
    expect(capturedArgs).toContain('src/db/schema.sql')
  })
})
