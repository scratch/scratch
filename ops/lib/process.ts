// Process spawning utilities

import { existsSync } from 'fs'
import { getInstanceWranglerPath, getWranglerConfigArg } from './config'

// Run a command and capture output (async version)
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

// Run a command with inherited stdio (output goes to terminal) - async version
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

// Helper to convert string command to array
function cmdToArray(cmd: string | string[]): string[] {
  return typeof cmd === 'string' ? cmd.split(' ') : cmd
}

// Helper to format command for display
function cmdToString(cmd: string | string[]): string {
  return typeof cmd === 'string' ? cmd : cmd.join(' ')
}

/**
 * Run a command and capture its output (synchronous).
 * Returns trimmed stdout on success, throws on non-zero exit.
 */
export function runCapture(cmd: string | string[], options?: { cwd?: string }): string {
  const cmdArray = cmdToArray(cmd)
  const proc = Bun.spawnSync(cmdArray, {
    cwd: options?.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim()
    throw new Error(`Command failed with exit code ${proc.exitCode}: ${stderr}`)
  }
  return proc.stdout.toString().trim()
}

/**
 * Run a command with inherited stdio (synchronous).
 * By default echoes the command to console.
 * Exits the process with the command's exit code on failure.
 */
export function run(
  cmd: string | string[],
  options?: {
    cwd?: string
    stdin?: boolean
    echo?: boolean
  }
): void {
  const { cwd, stdin = true, echo = true } = options ?? {}
  const cmdArray = cmdToArray(cmd)

  if (echo) {
    console.log(`$ ${cmdToString(cmd)}`)
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

// Validate that instance flag is provided
export function requireInstance(instance: string | undefined, command: string): string {
  if (!instance) {
    console.error(`Error: --instance (-i) is required for '${command}'`)
    console.error(`Usage: bun ops server -i <instance> ${command}`)
    process.exit(1)
  }
  return instance
}

// Get wrangler config path for CLI usage, validating it exists
export function getWranglerConfig(instance: string): string {
  const wranglerPath = getInstanceWranglerPath(instance)

  if (!existsSync(wranglerPath)) {
    console.error(`Error: ${wranglerPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    process.exit(1)
  }

  return getWranglerConfigArg(instance)
}
