// Share token URL cleanup tests - Step 8d2

import { describe, test, expect } from 'bun:test'
import { join } from 'path'
import { tmpdir } from 'os'
import { rm } from 'fs/promises'
import { getContext, generateRandomProjectName, CLI_BIN, green, yellow, reset } from './context'
import { runCommand, runCommandInherit } from '../../../lib/process'

export function shareTokenTests() {
  describe('Step 8d2: Share token URL cleanup', () => {
    test('share token redirects to clean URL with cookie', async () => {
      const ctx = getContext()
      console.log('Step 8d2: Testing share token URL cleanup...')

      const shareTokensEnabled = ctx.vars.get('ALLOW_SHARE_TOKENS') === 'true'
      if (!shareTokensEnabled) {
        console.log(`${yellow}!${reset} Share tokens disabled on this instance, skipping test`)
        return
      }

      // Create another private project for share token test
      const shareTestProjectName = generateRandomProjectName()
      const shareTestTempDir = join(tmpdir(), `scratch-${ctx.instance}-share-${Date.now()}`)

      const createExitCode = await runCommandInherit([CLI_BIN, 'create', shareTestTempDir])
      expect(createExitCode).toBe(0)

      // Deploy as private
      const shareTestDeployResult = await runCommand([
        CLI_BIN, 'publish', shareTestTempDir,
        '--server', ctx.serverUrl,
        '--visibility', 'private',
        '--name', shareTestProjectName,
        '--no-open',
      ])

      expect(shareTestDeployResult.exitCode).toBe(0)

      // Get the deployed URL from the deploy output
      const shareUrlMatch = shareTestDeployResult.stdout.match(/URLs:\s+(\S+)/)
      expect(shareUrlMatch).toBeTruthy()
      const shareDeployedUrl = shareUrlMatch![1]

      // Create share token via API
      const createShareResponse = await fetch(
        `${ctx.serverUrl}/api/projects/${encodeURIComponent(shareTestProjectName)}/share-tokens`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ctx.bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'test-share', duration: '1d' }),
        }
      )

      expect(createShareResponse.ok).toBe(true)

      const shareResult = await createShareResponse.json() as { share_url: string; token: string }
      const shareUrl = shareResult.share_url
      const shareToken = shareResult.token

      expect(shareUrl).toBeTruthy()
      expect(shareToken).toBeTruthy()
      console.log(`${green}✓${reset} Created share token via API`)

      // Request the page with share token in URL - should redirect to clean URL
      const shareRedirectResponse = await fetch(shareUrl, { redirect: 'manual' })

      expect(shareRedirectResponse.status).toBe(302)

      const shareCleanLocation = shareRedirectResponse.headers.get('Location')
      const shareSetCookie = shareRedirectResponse.headers.get('Set-Cookie')

      // Verify redirect is to clean URL (without token)
      expect(shareCleanLocation).toBeTruthy()
      expect(shareCleanLocation!.includes('token=')).toBe(false)
      console.log(`${green}✓${reset} Share token redirect to clean URL works`)

      // Verify share token cookie was set
      expect(shareSetCookie?.includes('_share_')).toBe(true)
      console.log(`${green}✓${reset} Share token cookie was set`)

      // Extract cookie for follow-up request
      const shareCookieMatch = shareSetCookie!.match(/(_share_[^=]+=)([^;]+)/)
      expect(shareCookieMatch).toBeTruthy()
      const shareCookieName = shareCookieMatch![1].slice(0, -1) // Remove trailing =
      const shareCookieValue = shareCookieMatch![2]

      // Verify content is served with just the cookie
      const shareCleanUrl = new URL(shareCleanLocation!)
      const shareFinalResponse = await fetch(shareCleanUrl.toString(), {
        headers: { 'Cookie': `${shareCookieName}=${shareCookieValue}` },
      })

      expect(shareFinalResponse.ok).toBe(true)
      console.log(`${green}✓${reset} Content served with share cookie only (no URL token)`)

      // Cleanup share test project
      await runCommand([CLI_BIN, 'projects', 'rm', shareTestProjectName, ctx.serverUrl, '--force'])
      try {
        await rm(shareTestTempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    })
  })
}
