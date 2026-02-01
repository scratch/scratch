// Deploy and logs commands

import { existsSync } from 'fs'
import { getInstanceWranglerPath, getWranglerConfigArg } from '../../lib/config'

export async function deployAction(instance: string): Promise<void> {
  console.log(`Deploying server to Cloudflare Workers (instance: ${instance})...\n`)

  const wranglerPath = getInstanceWranglerPath(instance)

  if (!existsSync(wranglerPath)) {
    console.error(`Error: ${wranglerPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    process.exit(1)
  }

  const proc = Bun.spawn(['bun', 'run', 'wrangler', 'deploy', '-c', getWranglerConfigArg(instance)], {
    cwd: 'server',
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    console.error(`Deploy failed with exit code ${exitCode}`)
    process.exit(exitCode)
  }

  console.log('\nDeploy complete!')
}

export async function logsAction(instance: string): Promise<void> {
  const wranglerPath = getInstanceWranglerPath(instance)

  if (!existsSync(wranglerPath)) {
    console.error(`Error: ${wranglerPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    process.exit(1)
  }

  console.log(`Tailing ${instance} worker logs (Ctrl+C to stop)...\n`)

  const proc = Bun.spawn(
    ['bun', 'run', 'wrangler', 'tail', '-c', getWranglerConfigArg(instance), '--format', 'pretty'],
    {
      cwd: 'server',
      stdout: 'inherit',
      stderr: 'inherit',
    }
  )

  process.on('SIGINT', () => {
    proc.kill()
    process.exit(0)
  })

  const exitCode = await proc.exited
  process.exit(exitCode)
}
