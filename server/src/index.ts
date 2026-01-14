import { Hono } from 'hono'
import type { Env } from './env'
import { authRoutes } from './routes/app/auth'
import { apiRoutes } from './routes/app/api/index'
import { uiRoutes } from './routes/app/ui'
import { pagesRoutes } from './routes/pages'
import { getContentDomain } from './lib/domains'

// App router - handles app subdomain (API, auth, UI)
const appRouter = new Hono<{ Bindings: Env }>({ strict: false })

// API routes
appRouter.route('/api', apiRoutes)

// Auth routes (BetterAuth + other auth endpoints)
appRouter.route('/auth', authRoutes)

// UI routes (HTML pages + device flow UI)
appRouter.route('/', uiRoutes)

// Main app with domain-based routing
const app = new Hono<{ Bindings: Env }>({ strict: false })

app.all('*', async (c) => {
  // HTTP host headers are case-insensitive per RFC
  const host = c.req.header('host')?.toLowerCase()

  // Route to pages handler for content subdomain (compare full host:port)
  const contentDomain = getContentDomain(c.env).toLowerCase()
  if (host === contentDomain) {
    return pagesRoutes.fetch(c.req.raw, c.env, c.executionCtx)
  }

  // Default to app routes (API, auth, UI) for app subdomain
  return appRouter.fetch(c.req.raw, c.env, c.executionCtx)
})

export default app
