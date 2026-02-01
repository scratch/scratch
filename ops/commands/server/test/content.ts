// Content verification tests - Step 8

import { describe, test, expect } from 'bun:test'
import { getContext, green, reset } from './context'

export function contentTests() {
  describe('Step 8: Content verification', () => {
    test('deployed content matches local', async () => {
      const ctx = getContext()
      console.log('Step 8: Verifying deployed content...')
      console.log(`Fetching: ${ctx.deployedUrl}`)

      // Give it a moment for deployment to propagate
      await new Promise(resolve => setTimeout(resolve, 2000))

      const response = await fetch(ctx.deployedUrl)
      expect(response.ok).toBe(true)

      const deployedContent = await response.text()

      // Compare content (normalize whitespace for comparison)
      const normalizeHtml = (html: string) => html.replace(/\s+/g, ' ').trim()

      expect(normalizeHtml(deployedContent)).toBe(normalizeHtml(ctx.localContent))
      console.log(`${green}✓${reset} Content matches!\n`)
    })
  })
}
