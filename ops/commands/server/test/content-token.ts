// Content token URL cleanup tests - Step 8d

import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFile, rm } from 'fs/promises'
import { getContext, generateRandomProjectName, CLI_BIN, green, reset } from './context'
import { runCommand, runCommandInherit } from '../../../lib/process'

export function contentTokenTests() {
  describe('Step 8d: Content token URL cleanup', () => {
    test('private project receives content token and redirects to clean URL', async () => {
      const ctx = getContext()
      console.log('Step 8d: Testing content token URL cleanup...')

      // Create a private project for this test
      ctx.privateProjectName = generateRandomProjectName()
      ctx.privateProjectDir = join(tmpdir(), `scratch-${ctx.instance}-private-${Date.now()}`)

      const createExitCode = await runCommandInherit([CLI_BIN, 'create', ctx.privateProjectDir])
      expect(createExitCode).toBe(0)

      // Deploy as private
      const privateDeployResult = await runCommand([
        CLI_BIN, 'publish', ctx.privateProjectDir,
        '--server', ctx.serverUrl,
        '--visibility', 'private',
        '--name', ctx.privateProjectName,
        '--no-open',
      ])

      expect(privateDeployResult.exitCode).toBe(0)

      // Extract project ID from project.toml
      const privateProjectTomlPath = join(ctx.privateProjectDir, '.scratch', 'project.toml')
      const privateProjectToml = await readFile(privateProjectTomlPath, 'utf-8')
      const privateIdMatch = privateProjectToml.match(/^id\s*=\s*"([^"]+)"/m)
      expect(privateIdMatch).toBeTruthy()
      const privateProjectId = privateIdMatch![1]

      // Get the deployed URL from the deploy output (includes owner path)
      const privateUrlMatch = privateDeployResult.stdout.match(/URLs:\s+(\S+)/)
      expect(privateUrlMatch).toBeTruthy()
      ctx.privateProjectUrl = privateUrlMatch![1]

      // Get CLI credentials to make authenticated request
      expect(ctx.bearerToken).toBeTruthy()

      // Get content token via /auth/content-access endpoint
      // Ensure URL has trailing slash for consistency
      const returnUrl = ctx.privateProjectUrl.endsWith('/') ? ctx.privateProjectUrl : `${ctx.privateProjectUrl}/`
      const contentAccessUrl = `https://${ctx.appDomain}/auth/content-access?project_id=${privateProjectId}&return_url=${encodeURIComponent(returnUrl)}`

      const tokenResponse = await fetch(contentAccessUrl, {
        headers: { 'Authorization': `Bearer ${ctx.bearerToken}` },
        redirect: 'manual',
      })

      expect([302, 303]).toContain(tokenResponse.status)
      console.log(`${green}✓${reset} Got content token from auth endpoint`)

      const redirectLocation = tokenResponse.headers.get('Location')
      expect(redirectLocation).toBeTruthy()

      const redirectUrl = new URL(redirectLocation!)
      const ctoken = redirectUrl.searchParams.get('_ctoken')
      expect(ctoken).toBeTruthy()
      ctx.contentToken = ctoken!

      // Request private page with token in URL - should get 302 redirect to clean URL
      const pageWithToken = `${returnUrl}?_ctoken=${ctoken}`
      const redirectResponse = await fetch(pageWithToken, { redirect: 'manual' })

      expect(redirectResponse.status).toBe(302)

      const cleanLocation = redirectResponse.headers.get('Location')
      const setCookieHeader = redirectResponse.headers.get('Set-Cookie')

      // Verify redirect is to clean URL (without token)
      expect(cleanLocation).toBeTruthy()
      expect(cleanLocation!.includes('_ctoken')).toBe(false)
      console.log(`${green}✓${reset} Server redirects to clean URL without token`)

      // Verify cookie was set
      expect(setCookieHeader?.includes('_content_token')).toBe(true)
      console.log(`${green}✓${reset} Content token cookie was set`)

      // Extract cookie value for follow-up request
      const cookieMatch = setCookieHeader!.match(/_content_token=([^;]+)/)
      expect(cookieMatch).toBeTruthy()
      const cookieValue = cookieMatch![1]

      // Verify content is served with just the cookie (no token in URL)
      const finalResponse = await fetch(returnUrl, {
        headers: { 'Cookie': `_content_token=${cookieValue}` },
      })

      expect(finalResponse.ok).toBe(true)
      console.log(`${green}✓${reset} Content served with cookie only (no URL token)`)
    })

    test('query params are preserved during redirect', async () => {
      const ctx = getContext()
      console.log('Testing query param preservation during redirect...')

      // Get a fresh content token
      const privateProjectTomlPath = join(ctx.privateProjectDir, '.scratch', 'project.toml')
      const privateProjectToml = await readFile(privateProjectTomlPath, 'utf-8')
      const privateIdMatch = privateProjectToml.match(/^id\s*=\s*"([^"]+)"/m)
      expect(privateIdMatch).toBeTruthy()
      const privateProjectId = privateIdMatch![1]

      const returnUrl = ctx.privateProjectUrl.endsWith('/') ? ctx.privateProjectUrl : `${ctx.privateProjectUrl}/`
      const contentAccessUrl = `https://${ctx.appDomain}/auth/content-access?project_id=${privateProjectId}&return_url=${encodeURIComponent(returnUrl)}`

      const tokenResponse = await fetch(contentAccessUrl, {
        headers: { 'Authorization': `Bearer ${ctx.bearerToken}` },
        redirect: 'manual',
      })

      expect([302, 303]).toContain(tokenResponse.status)

      const redirectLocation = tokenResponse.headers.get('Location')
      expect(redirectLocation).toBeTruthy()

      const redirectUrl = new URL(redirectLocation!)
      const ctoken = redirectUrl.searchParams.get('_ctoken')
      expect(ctoken).toBeTruthy()

      // Request with token AND extra query params
      const extraParams = 'foo=bar&baz=qux'
      const pageWithTokenAndParams = `${returnUrl}?_ctoken=${ctoken}&${extraParams}`
      const multiParamResponse = await fetch(pageWithTokenAndParams, { redirect: 'manual' })

      expect(multiParamResponse.status).toBe(302)

      const cleanLocation = multiParamResponse.headers.get('Location')
      expect(cleanLocation).toBeTruthy()

      const cleanUrl = new URL(cleanLocation!)
      const hasExtraParams = cleanUrl.searchParams.get('foo') === 'bar' && cleanUrl.searchParams.get('baz') === 'qux'
      const hasNoToken = !cleanUrl.searchParams.has('_ctoken')

      expect(hasExtraParams).toBe(true)
      expect(hasNoToken).toBe(true)
      console.log(`${green}✓${reset} Other query params preserved, token removed`)

      // Cleanup private test project
      await runCommand([CLI_BIN, 'projects', 'delete', ctx.privateProjectName, ctx.serverUrl, '--force'])
      try {
        await rm(ctx.privateProjectDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })
  })
}
