// WWW domain serving tests - Step 10

import { describe, test, expect } from 'bun:test'
import { writeFileSync } from 'fs'
import { getContext, CLI_BIN, green, yellow, reset } from './context'
import { writeVarsFile } from '../../../lib/config'
import { generateWranglerConfig } from '../setup'
import { runCommand, runCommandInherit } from '../../../lib/process'

export function wwwDomainTests() {
  describe('Step 10: WWW domain serving', () => {
    let originalWwwProjectId: string
    let d1DatabaseId: string | undefined

    test('WWW and naked domain serve project content', async () => {
      const ctx = getContext()
      console.log('Step 10: Testing WWW domain serving...')

      // Get project ID using CLI
      const projectInfoResult = await runCommand([
        CLI_BIN, 'projects', 'info', ctx.currentProjectName, ctx.serverUrl,
      ])

      const idMatch = projectInfoResult.stdout.match(/ID:\s+(\S+)/)
      expect(idMatch).toBeTruthy()

      const projectId = idMatch![1]
      console.log(`Project ID: ${projectId}`)

      // Save original WWW_PROJECT_ID
      originalWwwProjectId = ctx.vars.get('WWW_PROJECT_ID') || '_'
      d1DatabaseId = ctx.vars.get('D1_DATABASE_ID')

      expect(d1DatabaseId).toBeTruthy()

      // Update vars with WWW_PROJECT_ID
      ctx.vars.set('WWW_PROJECT_ID', projectId)
      writeVarsFile(ctx.varsPath, ctx.vars)
      console.log(`Updated WWW_PROJECT_ID to ${projectId}`)

      // Regenerate wrangler config to add www/naked domain routes (if not already present)
      const wranglerConfig = generateWranglerConfig(ctx.instance, d1DatabaseId!)
      writeFileSync(ctx.wranglerPath, wranglerConfig)
      console.log(`Regenerated ${ctx.wranglerPath}`)

      // Deploy to add the www routes (route changes require deploy)
      console.log('Deploying to add www routes...')
      let exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', ctx.instance, 'deploy'])
      expect(exitCode).toBe(0)

      // Push config to update WWW_PROJECT_ID secret (deploy only updates routes/code, not secrets)
      console.log('Pushing config...')
      exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', ctx.instance, 'config', 'push'])
      if (exitCode !== 0) {
        console.log(`${yellow}!${reset} Config push had issues (may be ok)`)
      }

      // Give it a moment for deployment to propagate
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Cache-busting param to bypass Cloudflare cache
      const cacheBuster = `_cb=${Date.now()}`

      // Test www domain
      const wwwUrl = `https://www.${ctx.baseDomain}/?${cacheBuster}`
      console.log(`Fetching WWW domain: ${wwwUrl}`)

      const wwwResponse = await fetch(wwwUrl)
      expect(wwwResponse.ok).toBe(true)

      const wwwContent = await wwwResponse.text()
      const normalizeHtml = (html: string) => html.replace(/\s+/g, ' ').trim()

      expect(normalizeHtml(wwwContent)).toBe(normalizeHtml(ctx.localContent))
      console.log(`${green}✓${reset} WWW domain content matches!\n`)

      // Test naked domain
      const nakedUrl = `https://${ctx.baseDomain}/?${cacheBuster}`
      console.log(`Fetching naked domain: ${nakedUrl}`)

      const nakedResponse = await fetch(nakedUrl)
      expect(nakedResponse.ok).toBe(true)

      const nakedContent = await nakedResponse.text()
      expect(normalizeHtml(nakedContent)).toBe(normalizeHtml(ctx.localContent))
      console.log(`${green}✓${reset} Naked domain content matches!\n`)

      // Restore original WWW_PROJECT_ID (no redeploy needed - config push updates the secret,
      // and the server returns 404 when WWW_PROJECT_ID is "_")
      console.log('Restoring original WWW_PROJECT_ID...')
      ctx.vars.set('WWW_PROJECT_ID', originalWwwProjectId)
      writeVarsFile(ctx.varsPath, ctx.vars)

      // Regenerate wrangler config to keep it in sync with vars file
      const restoredConfig = generateWranglerConfig(ctx.instance, d1DatabaseId!)
      writeFileSync(ctx.wranglerPath, restoredConfig)

      // Only config push needed - no redeploy since routes don't need to change
      exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', ctx.instance, 'config', 'push'])
      console.log(`${green}✓${reset} Restored original config\n`)
    })
  })
}
