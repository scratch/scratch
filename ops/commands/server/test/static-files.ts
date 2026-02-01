// Static file serving tests - Step 8b

import { describe, test, expect } from 'bun:test'
import { getContext, green, reset } from './context'

export function staticFileTests() {
  describe('Step 8b: Static file serving', () => {
    test('.md files are served as text/plain', async () => {
      const ctx = getContext()
      const mdUrl = `${ctx.projectBaseUrl}/readme.md`
      console.log(`Fetching: ${mdUrl}`)

      const response = await fetch(mdUrl)

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')?.startsWith('text/plain')).toBe(true)
      console.log(`${green}✓${reset} .md served as text/plain`)
    })

    test('.txt files are served as text/plain', async () => {
      const ctx = getContext()
      const txtUrl = `${ctx.projectBaseUrl}/notes.txt`
      console.log(`Fetching: ${txtUrl}`)

      const response = await fetch(txtUrl)

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')?.startsWith('text/plain')).toBe(true)
      console.log(`${green}✓${reset} .txt served as text/plain`)
    })

    test('.mdx URL redirects to .md', async () => {
      const ctx = getContext()
      const mdxUrl = `${ctx.projectBaseUrl}/source.mdx`
      console.log(`Fetching: ${mdxUrl}`)

      const response = await fetch(mdxUrl, { redirect: 'manual' })

      expect(response.status).toBe(301)
      expect(response.headers.get('location')?.endsWith('/source.md')).toBe(true)
      console.log(`${green}✓${reset} .mdx redirects to .md`)
    })

    test('.mdx redirect serves correct content', async () => {
      const ctx = getContext()
      const mdxUrl = `${ctx.projectBaseUrl}/source.mdx`

      const response = await fetch(mdxUrl, { redirect: 'follow' })

      expect(response.ok).toBe(true)
      const content = await response.text()
      const hasExpectedContent = content.includes('MDX Source') || content.includes('Hello world from source.mdx')
      expect(hasExpectedContent).toBe(true)
      console.log(`${green}✓${reset} .mdx redirect serves correct content`)
    })

    test('compiled HTML page is accessible', async () => {
      const ctx = getContext()
      const htmlUrl = `${ctx.projectBaseUrl}/source/`

      const response = await fetch(htmlUrl)

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')?.includes('text/html')).toBe(true)
      console.log(`${green}✓${reset} Compiled HTML page still accessible`)
    })
  })
}
