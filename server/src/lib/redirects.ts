// URL redirect middleware helpers

import type { MiddlewareHandler } from 'hono'
import type { Env } from '../env'

/**
 * Middleware that redirects .mdx URLs to .md
 * The CLI renames .mdx files to .md when copying, so we redirect for compatibility
 */
export function mdxRedirectMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const url = new URL(c.req.url)
    const pathname = url.pathname

    if (pathname.endsWith('.mdx')) {
      const redirectUrl = new URL(url)
      redirectUrl.pathname = pathname.slice(0, -4) + '.md'
      return c.redirect(redirectUrl.toString(), 301)
    }

    await next()
  }
}
