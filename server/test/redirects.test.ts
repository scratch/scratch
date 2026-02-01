import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { mdxRedirectMiddleware } from '../src/lib/redirects'
import type { Env } from '../src/env'

// Helper to create a test app with the middleware
function createTestApp() {
  const app = new Hono<{ Bindings: Env }>()
  app.use('*', mdxRedirectMiddleware())
  app.get('*', (c) => c.text('OK'))
  return app
}

describe('mdxRedirectMiddleware', () => {
  test('redirects .mdx URLs to .md with 301 status', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/page.mdx')

    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://example.com/page.md')
  })

  test('redirects nested .mdx paths to .md', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/docs/guide/intro.mdx')

    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://example.com/docs/guide/intro.md')
  })

  test('preserves query parameters during redirect', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/page.mdx?foo=bar&baz=qux')

    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://example.com/page.md?foo=bar&baz=qux')
  })

  test('does not redirect non-.mdx URLs', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/page.md')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')
  })

  test('does not redirect URLs ending with .mdx in the middle', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/mdx-files/page.md')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')
  })

  test('does not redirect .mdxx or similar extensions', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/page.mdxx')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')
  })

  test('handles root path without .mdx', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')
  })

  test('redirects file named just .mdx', async () => {
    const app = createTestApp()
    const res = await app.request('https://example.com/.mdx')

    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe('https://example.com/.md')
  })
})
