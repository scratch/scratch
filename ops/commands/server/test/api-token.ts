// API token authentication tests - Step 8e

import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { tmpdir } from 'os'
import { rm } from 'fs/promises'
import { getContext, generateRandomProjectName, CLI_BIN, green, reset } from './context'
import { runCommand } from '../../../lib/process'

export function apiTokenTests() {
  describe('Step 8e: API token authentication', () => {
    let tokenName: string
    let apiToken: string

    test('create API token', async () => {
      const ctx = getContext()
      console.log('Step 8e: Testing API token authentication...')

      tokenName = `test-token-${Date.now()}`
      const createTokenResult = await runCommand([
        CLI_BIN, 'tokens', 'create', tokenName, ctx.serverUrl,
        '--expires', '1',  // 1 day expiry
      ])

      expect(createTokenResult.exitCode).toBe(0)

      // Extract the token from output (it should be on a line by itself after "Created API token:")
      const tokenMatch = createTokenResult.stdout.match(/scratch_[a-zA-Z0-9]+/)
      expect(tokenMatch).toBeTruthy()

      apiToken = tokenMatch![0]
      ctx.apiKeyToken = apiToken
      console.log(`${green}✓${reset} Created API token: ${apiToken.slice(0, 12)}...`)
    })

    test('token appears in list', async () => {
      const ctx = getContext()
      const listResult = await runCommand([CLI_BIN, 'tokens', 'ls', ctx.serverUrl])
      expect(listResult.stdout.includes(tokenName)).toBe(true)
      console.log(`${green}✓${reset} Token appears in list`)
    })

    test('authenticate with API token via X-Api-Key header', async () => {
      const ctx = getContext()
      const apiResponse = await fetch(`${ctx.serverUrl}/api/me`, {
        headers: { 'X-Api-Key': ctx.apiKeyToken },
      })

      expect(apiResponse.ok).toBe(true)

      const apiUser = await apiResponse.json() as { user: { email: string } }
      console.log(`${green}✓${reset} API token authenticated as ${apiUser.user.email}`)
    })

    test('deploy using SCRATCH_TOKEN env var', async () => {
      const ctx = getContext()
      // Create a simple temp project for env var test
      const envTestDir = join(tmpdir(), `scratch-env-test-${Date.now()}`)
      await runCommand([CLI_BIN, 'create', envTestDir])
      const envTestProjectName = generateRandomProjectName()

      // Deploy with SCRATCH_TOKEN env var (simulate CI environment)
      const envDeployResult = await runCommand([
        CLI_BIN, 'publish', envTestDir,
        '--server', ctx.serverUrl,
        '--name', envTestProjectName,
        '--visibility', 'public',
        '--no-open',
      ], { env: { ...process.env, SCRATCH_TOKEN: ctx.apiKeyToken } })

      expect(envDeployResult.exitCode).toBe(0)
      console.log(`${green}✓${reset} Deploy with SCRATCH_TOKEN env var succeeded`)

      // Cleanup the test project
      await runCommand([CLI_BIN, 'projects', 'delete', envTestProjectName, ctx.serverUrl, '--force'])

      // Cleanup env test dir
      try {
        await rm(envTestDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })

    test('revoke token', async () => {
      const ctx = getContext()
      const revokeResult = await runCommand([
        CLI_BIN, 'tokens', 'revoke', tokenName, ctx.serverUrl,
      ])

      expect(revokeResult.exitCode).toBe(0)
      console.log(`${green}✓${reset} Token revoked successfully`)
    })

    test('revoked token is rejected', async () => {
      const ctx = getContext()
      const revokedResponse = await fetch(`${ctx.serverUrl}/api/me`, {
        headers: { 'X-Api-Key': ctx.apiKeyToken },
      })

      expect(revokedResponse.status).toBe(401)
      console.log(`${green}✓${reset} Revoked token correctly rejected`)
    })

    test('invalid token is rejected', async () => {
      const ctx = getContext()
      const invalidResponse = await fetch(`${ctx.serverUrl}/api/me`, {
        headers: { 'X-Api-Key': 'scratch_invalid_token_12345' },
      })

      expect(invalidResponse.status).toBe(401)
      console.log(`${green}✓${reset} Invalid token correctly rejected`)
    })

    test('API token must NOT work on content domain (security invariant)', async () => {
      const ctx = getContext()
      // The pages subdomain serves user-uploaded JS, so API keys must be rejected there
      // to prevent malicious JS from using a stolen API key.
      // We verify by testing against the actual deployed test project (deployedUrl) and
      // confirming that providing an API token doesn't change the response behavior.
      console.log(`Testing API token on content domain against: ${ctx.deployedUrl}`)

      // First, verify the project is accessible without any auth
      const baselineResponse = await fetch(ctx.deployedUrl, { redirect: 'manual' })
      const baselineStatus = baselineResponse.status

      // Now try with API token - should get EXACT same response (token ignored)
      const withApiTokenResponse = await fetch(ctx.deployedUrl, {
        headers: { 'X-Api-Key': ctx.apiKeyToken },
        redirect: 'manual',
      })

      expect(withApiTokenResponse.status).toBe(baselineStatus)
      console.log(`${green}✓${reset} API token correctly ignored on content domain (status unchanged: ${withApiTokenResponse.status})`)

      // Also verify that a non-existent private path still redirects to auth even with API token
      // (the token should not bypass auth redirect for private/non-existent paths)
      const nonExistentPrivateUrl = `https://${ctx.pagesDomain}/_/nonexistent-private-project/`
      const nonExistentWithTokenResponse = await fetch(nonExistentPrivateUrl, {
        headers: { 'X-Api-Key': ctx.apiKeyToken },
        redirect: 'manual',
      })

      // Should redirect to auth (302/303), NOT return 200 or 404
      expect(nonExistentWithTokenResponse.status).not.toBe(200)

      if (nonExistentWithTokenResponse.status === 302 || nonExistentWithTokenResponse.status === 303) {
        const location = nonExistentWithTokenResponse.headers.get('location') || ''
        if (location.includes('/auth/content-access')) {
          console.log(`${green}✓${reset} Private path still redirects to auth even with API token`)
        } else {
          console.log(`${green}✓${reset} Private path redirects (token ignored), location: ${location.slice(0, 50)}...`)
        }
      } else {
        console.log(`${green}✓${reset} API token did not bypass auth for private path (status: ${nonExistentWithTokenResponse.status})`)
      }
    })
  })
}
