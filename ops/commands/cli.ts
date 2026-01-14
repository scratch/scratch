import { Command } from 'commander'
import { runRelease, type BumpType } from './release'

// CLI commands: pass-through to bun run + release command
// Usage:
//   bun ops cli <script> [args...]    - runs: bun run <script> in cli/
//   bun ops cli release [type]        - release CLI with new version

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

export function registerCliCommands(program: Command): void {
  const cli = program
    .command('cli')
    .description('CLI build, test, and release commands')

  // Release command
  cli
    .command('release [type]')
    .description('Release CLI (type: patch, minor, major)')
    .action(async (type?: string) => {
      const bumpType: BumpType = (type as BumpType) || 'patch'
      if (!['patch', 'minor', 'major'].includes(bumpType)) {
        console.error('Error: Invalid bump type. Use: patch, minor, or major')
        process.exit(1)
      }
      await runRelease('cli', bumpType)
    })

  // Pass-through command for other scripts
  cli
    .command('run')
    .description('Run any CLI script (pass-through to bun run in cli/)')
    .argument('<script>', 'Script to run (e.g., build, test, test:unit)')
    .argument('[args...]', 'Additional arguments')
    .allowUnknownOption()
    .action(async (script: string, args: string[]) => {
      await runCliScript(script, args)
    })

  // Convenience aliases for common scripts
  cli
    .command('build')
    .description('Build the scratch CLI')
    .action(async () => {
      await runCliScript('build', [])
    })

  cli
    .command('build:all')
    .description('Build CLI for all platforms')
    .action(async () => {
      await runCliScript('build:all', [])
    })

  cli
    .command('test')
    .description('Run all CLI tests')
    .action(async () => {
      await runCliScript('test', [])
    })

  cli
    .command('test:unit')
    .description('Run unit tests only')
    .action(async () => {
      await runCliScript('test:unit', [])
    })

  cli
    .command('test:e2e')
    .description('Run e2e tests only')
    .action(async () => {
      await runCliScript('test:e2e', [])
    })

  cli
    .command('test:parallel')
    .description('Run all tests in parallel')
    .option('-j, --concurrency <n>', 'Max concurrent test processes (default: CPU count)')
    .action(async (options: { concurrency?: string }) => {
      const args: string[] = []
      if (options.concurrency) {
        args.push('-j', options.concurrency)
      }
      await runCliScript('test:parallel', args)
    })
}
