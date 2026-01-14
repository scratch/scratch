// Integration test command

import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rm, readFile } from 'fs/promises'
import { green, yellow, red, reset } from '../../lib/colors'
import { parseVarsFile, getInstanceVarsPath } from '../../lib/config'
import { runCommand, runCommandInherit, getWranglerConfig } from '../../lib/process'

const CLI_BIN = './cli/dist/scratch'

function generateRandomProjectName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let name = 'test-'
  for (let i = 0; i < 8; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return name
}

export async function integrationTestAction(instance: string): Promise<void> {
  // Read instance vars to get domains
  const varsPath = getInstanceVarsPath(instance)
  if (!existsSync(varsPath)) {
    console.error(`Error: ${varsPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    process.exit(1)
  }

  const vars = parseVarsFile(varsPath)
  const baseDomain = vars.get('BASE_DOMAIN')
  const appSubdomain = vars.get('APP_SUBDOMAIN')
  const contentSubdomain = vars.get('CONTENT_SUBDOMAIN')

  if (!baseDomain || !appSubdomain || !contentSubdomain) {
    console.error('Error: Missing required vars (BASE_DOMAIN, APP_SUBDOMAIN, CONTENT_SUBDOMAIN)')
    process.exit(1)
  }

  const appDomain = `${appSubdomain}.${baseDomain}`
  const pagesDomain = `${contentSubdomain}.${baseDomain}`

  console.log(`Running integration test against ${instance}...\n`)
  console.log(`App domain: ${appDomain}`)
  console.log(`Pages domain: ${pagesDomain}\n`)

  const projectName = generateRandomProjectName()
  const tempDir = join(tmpdir(), `scratch-${instance}-test-${Date.now()}`)
  let testPassed = true
  let logsProcess: ReturnType<typeof Bun.spawn> | null = null

  // Cleanup function to kill logs process and reset terminal
  const cleanup = async () => {
    if (logsProcess) {
      logsProcess.kill()
      logsProcess = null
      // Reset terminal settings - wrangler tail can leave terminal in raw mode
      Bun.spawnSync(['stty', 'sane'], { stdin: 'inherit' })
    }
  }

  // Handle Ctrl-C
  const sigintHandler = async () => {
    console.log('\n\nInterrupted, cleaning up...')
    await cleanup()
    process.exit(1)
  }
  process.on('SIGINT', sigintHandler)

  try {
    // Step 1: Build the CLI
    console.log('Step 1: Building CLI...')
    let exitCode = await runCommandInherit(['bun', 'ops', 'cli', 'build'])
    if (exitCode !== 0) {
      throw new Error('CLI build failed')
    }
    console.log(`${green}✓${reset} CLI built successfully\n`)

    // Step 2: Run migrations
    console.log(`Step 2: Running ${instance} migrations...`)
    exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', instance, 'db', 'migrate'])
    if (exitCode !== 0) {
      throw new Error('Migrations failed')
    }
    console.log(`${green}✓${reset} Migrations complete\n`)

    // Step 3: Deploy server
    // Note: UI pages are now server-rendered, no separate UI deploy needed
    console.log(`Step 3: Deploying server to ${instance}...`)
    exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', instance, 'deploy'])
    if (exitCode !== 0) {
      throw new Error('Deploy failed')
    }
    console.log(`${green}✓${reset} Server deployed\n`)

    // Step 4: Start tailing logs (prints inline)
    console.log('Step 4: Starting log tail (logs will print inline)...')
    const wranglerConfig = getWranglerConfig(instance)

    logsProcess = Bun.spawn(
      ['bun', 'run', 'wrangler', 'tail', '-c', wranglerConfig, '--format', 'pretty'],
      {
        cwd: 'server',
        stdout: 'inherit',
        stderr: 'inherit',
      }
    )

    console.log(`${green}✓${reset} Log tail started\n`)

    // Step 5: Login with CLI
    console.log('Step 5: Logging in with CLI...')
    const serverUrl = `https://${appDomain}`

    // Check if already logged in
    const whoamiResult = await runCommand([CLI_BIN, 'cloud', 'whoami', '--server-url', serverUrl])
    if (whoamiResult.stdout.includes('Not logged in')) {
      console.log('Not logged in. Please complete login in browser...')
      // Use 15 second timeout for test - fail fast if login flow is broken
      exitCode = await runCommandInherit([CLI_BIN, 'cloud', 'login', '--server-url', serverUrl, '--timeout', '0.25'])
      if (exitCode !== 0) {
        throw new Error('Login failed (timed out or denied)')
      }
    } else {
      console.log(`Already logged in: ${whoamiResult.stdout.trim()}`)
    }
    console.log(`${green}✓${reset} Logged in\n`)

    // Step 6: Create scratch project in temp directory
    console.log(`Step 6: Creating scratch project in ${tempDir}...`)
    exitCode = await runCommandInherit([CLI_BIN, 'create', tempDir])
    if (exitCode !== 0) {
      throw new Error('Project creation failed')
    }
    console.log(`${green}✓${reset} Project created\n`)

    // Step 7: Deploy the scratch project
    console.log(`Step 7: Deploying project "${projectName}" to ${instance}...`)
    const deployResult = await runCommand([
      CLI_BIN, 'cloud', 'deploy', tempDir,
      '--server-url', serverUrl,
      '--visibility', 'public',
      '--name', projectName,
    ])

    if (deployResult.exitCode !== 0) {
      throw new Error(`Deploy failed: ${deployResult.stderr}`)
    }
    console.log(deployResult.stdout)
    console.log(`${green}✓${reset} Project deployed\n`)

    // Step 8: Verify content matches
    console.log('Step 8: Verifying deployed content...')

    // Read local dist/index.html
    const localIndexPath = join(tempDir, 'dist', 'index.html')
    const localContent = await readFile(localIndexPath, 'utf-8')

    // Parse deployed URL from deploy output (first URL after "URLs:")
    const urlMatch = deployResult.stdout.match(/URLs:\s+(\S+)/)
    const deployedUrl = urlMatch ? urlMatch[1] : `https://${pagesDomain}/${projectName}/`
    console.log(`Fetching: ${deployedUrl}`)

    // Give it a moment for deployment to propagate
    await new Promise(resolve => setTimeout(resolve, 2000))

    const response = await fetch(deployedUrl)
    if (!response.ok) {
      console.error(`${red}✗${reset} Failed to fetch deployed content: ${response.status}`)
      testPassed = false
    } else {
      const deployedContent = await response.text()

      // Compare content (normalize whitespace for comparison)
      const normalizeHtml = (html: string) => html.replace(/\s+/g, ' ').trim()

      if (normalizeHtml(localContent) === normalizeHtml(deployedContent)) {
        console.log(`${green}✓${reset} Content matches!\n`)
      } else {
        console.error(`${red}✗${reset} Content mismatch!`)
        console.log('\nLocal content (first 500 chars):')
        console.log(localContent.slice(0, 500))
        console.log('\nDeployed content (first 500 chars):')
        console.log(deployedContent.slice(0, 500))
        testPassed = false
      }
    }

    // Cleanup: Delete the test project
    console.log('Cleanup: Deleting test project...')
    const deleteResult = await runCommand([
      CLI_BIN, 'cloud', 'projects', 'delete', projectName,
      '--server-url', serverUrl,
      '--force',
    ])
    if (deleteResult.exitCode === 0) {
      console.log(`${green}✓${reset} Test project deleted\n`)
    } else {
      console.log(`${yellow}!${reset} Could not delete test project (may need manual cleanup)\n`)
    }

  } catch (error) {
    console.error(`${red}✗${reset} ${error instanceof Error ? error.message : error}`)
    testPassed = false
  } finally {
    // Stop log tail process
    await cleanup()
    process.off('SIGINT', sigintHandler)
    console.log('Stopped log tail')

    // Cleanup temp directory
    try {
      await rm(tempDir, { recursive: true, force: true })
      console.log(`Cleaned up temp directory: ${tempDir}`)
    } catch {
      // Ignore cleanup errors
    }
  }

  if (testPassed) {
    console.log(`\n${green}✓${reset} Integration test passed!`)
  } else {
    console.log(`\n${red}✗${reset} Integration test failed!`)
    process.exit(1)
  }
}
