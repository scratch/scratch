// Test context - shared state and utilities for integration tests

import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rm } from 'fs/promises'
import { green, yellow, reset } from '../../../lib/output'
import { parseVarsFile, getInstanceVarsPath, getInstanceWranglerPath } from '../../../lib/config'
import { runCommand } from '../../../lib/process'

const CLI_BIN = './cli/dist/scratch'

// --- Types ---
export interface TestContext {
  instance: string
  config: { appUrl: string; pagesUrl: string; wwwUrl: string }
  vars: Map<string, string>
  varsPath: string
  wranglerPath: string
  baseDomain: string
  appDomain: string
  pagesDomain: string
  serverUrl: string
  projectName: string
  currentProjectName: string
  projectDir: string
  projectBaseUrl: string
  deployedUrl: string
  localContent: string
  bearerToken: string
  apiKeyToken: string
  shareToken: string
  contentToken: string
  projectUrl: string
  privateProjectName: string
  privateProjectDir: string
  privateProjectUrl: string
  logsProcess: ReturnType<typeof Bun.spawn> | null
}

// --- Module-level state (singleton) ---
let ctx: TestContext | null = null

export function getContext(): TestContext {
  if (!ctx) {
    throw new Error('TestContext not initialized. Call initializeContext() first.')
  }
  return ctx
}

export function generateRandomProjectName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let name = 'test-'
  for (let i = 0; i < 8; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return name
}

export async function initializeContext(instance: string): Promise<TestContext> {
  if (ctx) {
    return ctx // Already initialized
  }

  console.log(`Initializing test context for instance: ${instance}`)

  // Read vars file
  const varsPath = getInstanceVarsPath(instance)
  if (!existsSync(varsPath)) {
    throw new Error(`${varsPath} not found. Run: bun ops server -i ${instance} setup`)
  }

  const vars = parseVarsFile(varsPath)
  const baseDomain = vars.get('BASE_DOMAIN')
  const appSubdomain = vars.get('APP_SUBDOMAIN')
  const contentSubdomain = vars.get('CONTENT_SUBDOMAIN')

  if (!baseDomain || !appSubdomain || !contentSubdomain) {
    throw new Error('Missing required vars (BASE_DOMAIN, APP_SUBDOMAIN, CONTENT_SUBDOMAIN)')
  }

  const appDomain = `${appSubdomain}.${baseDomain}`
  const pagesDomain = `${contentSubdomain}.${baseDomain}`
  const serverUrl = `https://${appDomain}`

  const projectName = generateRandomProjectName()
  const tempDir = join(tmpdir(), `scratch-${instance}-test-${Date.now()}`)

  console.log(`Running integration test against ${instance}...\n`)
  console.log(`App domain: ${appDomain}`)
  console.log(`Pages domain: ${pagesDomain}\n`)

  ctx = {
    instance,
    config: {
      appUrl: serverUrl,
      pagesUrl: `https://${pagesDomain}`,
      wwwUrl: `https://www.${baseDomain}`,
    },
    vars,
    varsPath,
    wranglerPath: getInstanceWranglerPath(instance),
    baseDomain,
    appDomain,
    pagesDomain,
    serverUrl,
    projectName,
    currentProjectName: projectName, // Updated if renamed in Step 9
    projectDir: tempDir,
    projectBaseUrl: '',     // Set after deployment
    deployedUrl: '',        // Set after deployment
    localContent: '',       // Set after build
    bearerToken: '',        // Set after login
    apiKeyToken: '',        // Set after token creation
    shareToken: '',         // Set if share tokens enabled
    contentToken: '',       // Set for private project tests
    projectUrl: '',         // Set after deployment
    privateProjectName: '', // Set for private project tests
    privateProjectDir: '',  // Set for private project tests
    privateProjectUrl: '',  // Set for private project tests
    logsProcess: null,      // Set when starting logs
  }

  return ctx
}

export async function cleanupContext(): Promise<void> {
  if (!ctx) return

  console.log('Running cleanup...')

  // Stop log tail process
  if (ctx.logsProcess) {
    ctx.logsProcess.kill()
    ctx.logsProcess = null
    // Reset terminal settings - wrangler tail can leave terminal in raw mode
    Bun.spawnSync(['stty', 'sane'], { stdin: 'inherit' })
    console.log('Stopped log tail')
  }

  // Delete test project if it was created (use currentProjectName in case it was renamed)
  if (ctx.currentProjectName) {
    console.log(`Deleting test project: ${ctx.currentProjectName}...`)
    const result = await runCommand([
      CLI_BIN, 'projects', 'delete', ctx.currentProjectName, ctx.serverUrl, '--force'
    ])
    if (result.exitCode === 0) {
      console.log(`${green}✓${reset} Test project deleted`)
    } else {
      console.log(`${yellow}!${reset} Could not delete test project (may need manual cleanup)`)
    }
  }

  // Cleanup temp directory
  try {
    await rm(ctx.projectDir, { recursive: true, force: true })
    console.log(`Cleaned up temp directory: ${ctx.projectDir}`)
  } catch {
    // Ignore cleanup errors
  }

  ctx = null
}

// SIGINT handler for Ctrl-C - call cleanup and exit
export function registerSigintHandler(): void {
  const handler = async () => {
    console.log('\n\nInterrupted, cleaning up...')
    await cleanupContext()
    process.exit(1)
  }
  process.on('SIGINT', handler)
}

// Re-export CLI_BIN for use by other test modules
export { CLI_BIN }

// Re-export colors for consistent output
export { green, yellow, reset } from '../../../lib/output'
