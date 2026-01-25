import { Command } from 'commander'

// Website commands: pass-through to scratch CLI
// Usage:
//   bun ops website publish    - publishes the website using scratch publish

async function runScratchCommand(cmd: string, args: string[] = []): Promise<void> {
  const proc = Bun.spawn(['scratch', cmd, ...args], {
    cwd: 'website',
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })

  const exitCode = await proc.exited
  process.exit(exitCode)
}

export function registerWebsiteCommands(program: Command): void {
  const website = program
    .command('website')
    .description('Website (https://scratch.dev) commands')

  website
    .command('publish')
    .description('Publish the website')
    .action(async () => {
      await runScratchCommand('publish')
    })
}
