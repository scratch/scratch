// Setup tests - Steps 1-7: Build CLI, migrations, deploy, login, create project

import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'
import { getContext, CLI_BIN, green, reset } from './context'
import { runCommand, runCommandInherit, getWranglerConfig } from '../../../lib/process'

export function setupTests() {
  describe('Setup', () => {
    test('Step 1: Build CLI', async () => {
      console.log('Step 1: Building CLI...')
      const exitCode = await runCommandInherit(['bun', 'ops', 'cli', 'build'])
      expect(exitCode).toBe(0)
      console.log(`${green}✓${reset} CLI built successfully\n`)
    })

    test('Step 2: Run migrations', async () => {
      const ctx = getContext()
      console.log(`Step 2: Running ${ctx.instance} migrations...`)
      const exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', ctx.instance, 'db', 'migrate'])
      expect(exitCode).toBe(0)
      console.log(`${green}✓${reset} Migrations complete\n`)
    })

    test('Step 3: Deploy server', async () => {
      const ctx = getContext()
      console.log(`Step 3: Deploying server to ${ctx.instance}...`)
      const exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', ctx.instance, 'deploy'])
      expect(exitCode).toBe(0)
      console.log(`${green}✓${reset} Server deployed\n`)
    })

    test('Step 4: Start log tail', async () => {
      const ctx = getContext()
      console.log('Step 4: Starting log tail (logs will print inline)...')
      const wranglerConfig = getWranglerConfig(ctx.instance)

      ctx.logsProcess = Bun.spawn(
        ['bun', 'run', 'wrangler', 'tail', '-c', wranglerConfig, '--format', 'pretty'],
        {
          cwd: 'server',
          stdout: 'inherit',
          stderr: 'inherit',
        }
      )

      expect(ctx.logsProcess).toBeTruthy()
      console.log(`${green}✓${reset} Log tail started\n`)
    })

    test('Step 5: Login with CLI', async () => {
      const ctx = getContext()
      console.log('Step 5: Logging in with CLI...')

      // Check if already logged in
      const whoamiResult = await runCommand([CLI_BIN, 'whoami', ctx.serverUrl])
      if (whoamiResult.stdout.includes('Not logged in')) {
        console.log('Not logged in. Please complete login in browser...')
        // Use 15 second timeout for test - fail fast if login flow is broken
        const exitCode = await runCommandInherit([CLI_BIN, 'login', ctx.serverUrl, '--timeout', '0.25'])
        expect(exitCode).toBe(0)
      } else {
        console.log(`Already logged in: ${whoamiResult.stdout.trim()}`)
      }

      // Read credentials for later use
      const credentialsPath = join(process.env.HOME || '~', '.scratch', 'credentials.json')
      try {
        const credentials = JSON.parse(await readFile(credentialsPath, 'utf-8'))
        for (const [server, creds] of Object.entries(credentials)) {
          if (server.includes(ctx.appDomain)) {
            ctx.bearerToken = (creds as { token: string }).token
            break
          }
        }
      } catch {
        // Will be handled in tests that need it
      }

      console.log(`${green}✓${reset} Logged in\n`)
    })

    test('Step 6: Create scratch project', async () => {
      const ctx = getContext()
      console.log(`Step 6: Creating scratch project in ${ctx.projectDir}...`)
      const exitCode = await runCommandInherit([CLI_BIN, 'create', ctx.projectDir])
      expect(exitCode).toBe(0)

      // Add test files for static file serving tests
      await writeFile(join(ctx.projectDir, 'pages', 'source.mdx'), '# MDX Source\n\nHello world from source.mdx')
      await writeFile(join(ctx.projectDir, 'pages', 'notes.txt'), 'Plain text notes')
      await writeFile(join(ctx.projectDir, 'pages', 'readme.md'), '# Readme\n\nDocumentation')
      console.log(`${green}✓${reset} Project created with test files\n`)
    })

    test('Step 7: Deploy scratch project', async () => {
      const ctx = getContext()
      console.log(`Step 7: Deploying project "${ctx.projectName}" to ${ctx.instance}...`)
      const deployResult = await runCommand([
        CLI_BIN, 'publish', ctx.projectDir,
        '--server', ctx.serverUrl,
        '--visibility', 'public',
        '--name', ctx.projectName,
        '--no-open',
      ])

      expect(deployResult.exitCode).toBe(0)
      console.log(deployResult.stdout)

      // Read local dist/index.html
      const localIndexPath = join(ctx.projectDir, 'dist', 'index.html')
      ctx.localContent = await readFile(localIndexPath, 'utf-8')

      // Parse deployed URL from deploy output (first URL after "URLs:")
      const urlMatch = deployResult.stdout.match(/URLs:\s+(\S+)/)
      ctx.deployedUrl = urlMatch ? urlMatch[1] : `https://${ctx.pagesDomain}/${ctx.projectName}/`
      ctx.projectBaseUrl = ctx.deployedUrl.replace(/\/$/, '')
      ctx.projectUrl = ctx.deployedUrl

      console.log(`${green}✓${reset} Project deployed\n`)
    })
  })
}
