// Process spawning utilities

import { existsSync } from 'fs'
import { getInstanceWranglerPath } from './config'

// Run a command and capture output
export async function runCommand(
  cmd: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  return { stdout, stderr, exitCode }
}

// Run a command with inherited stdio (output goes to terminal)
export async function runCommandInherit(
  cmd: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
): Promise<number> {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  return proc.exited
}

// Validate that instance flag is provided
export function requireInstance(instance: string | undefined, command: string): string {
  if (!instance) {
    console.error(`Error: --instance (-i) is required for '${command}'`)
    console.error(`Usage: bun ops server -i <instance> ${command}`)
    process.exit(1)
  }
  return instance
}

// Get wrangler config path, validating it exists
export function getWranglerConfig(instance: string): string {
  const wranglerPath = getInstanceWranglerPath(instance)

  if (!existsSync(wranglerPath)) {
    console.error(`Error: ${wranglerPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    process.exit(1)
  }

  return wranglerPath.replace('server/', '')
}
