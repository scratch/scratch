// Enumeration prevention tests - Step 8c

import { describe, test, expect } from 'bun:test'
import { getContext, green, reset } from './context'

export function enumerationTests() {
  describe('Step 8c: Enumeration prevention', () => {
    test('non-existent project redirects to auth (prevents enumeration)', async () => {
      const ctx = getContext()
      console.log('Step 8c: Testing project enumeration prevention...')

      const nonExistentUrl = `https://${ctx.pagesDomain}/nonexistent-user-12345/nonexistent-project-67890/`
      console.log(`Fetching: ${nonExistentUrl}`)

      const response = await fetch(nonExistentUrl, { redirect: 'manual' })

      // Should redirect (302 or 303), NOT return 404
      expect([302, 303]).toContain(response.status)

      const location = response.headers.get('location') || ''
      expect(location.includes('/auth/content-access')).toBe(true)

      console.log(`${green}✓${reset} Non-existent project redirects to auth (prevents enumeration)`)
    })

    test('public project serves content directly (no redirect)', async () => {
      const ctx = getContext()
      const response = await fetch(ctx.deployedUrl, { redirect: 'manual' })

      // Public project should serve directly or do trailing slash redirect
      if (response.status === 301) {
        // Follow the redirect and check final response
        const redirectedUrl = response.headers.get('location')!
        const finalResponse = await fetch(redirectedUrl, { redirect: 'manual' })
        expect(finalResponse.status).toBe(200)
        console.log(`${green}✓${reset} Public project serves content directly (after slash redirect)`)
      } else {
        expect(response.status).toBe(200)
        console.log(`${green}✓${reset} Public project serves content directly`)
      }
    })
  })
}
