import { Hono } from 'hono'
import type { Env } from './env'
import { authRoutes } from './routes/app/auth'
import { apiRoutes } from './routes/app/api/index'
import { uiRoutes } from './routes/app/ui'
import { pagesRoutes } from './routes/pages'
import { wwwRoutes } from './routes/www'
import { getContentDomain, isWwwOrRootDomain } from './lib/domains'
import { validateEnvForAuthMode } from './lib/validate-env'

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

// Track if env has been validated (per isolate)
let envValidated = false

app.all('*', async (c) => {
  // Validate environment on first request (skipped in test mode)
  if (!envValidated && !c.env.TEST_MODE) {
    validateEnvForAuthMode(c.env)
    envValidated = true
  }

  // HTTP host headers are case-insensitive per RFC
  const host = c.req.header('host')?.toLowerCase()

  // Route to pages handler for content subdomain (compare full host:port)
  const contentDomain = getContentDomain(c.env).toLowerCase()
  if (host === contentDomain) {
    return pagesRoutes.fetch(c.req.raw, c.env, c.executionCtx)
  }

  // Route to www handler for www subdomain or naked domain
  if (host && isWwwOrRootDomain(host, c.env)) {
    return wwwRoutes.fetch(c.req.raw, c.env, c.executionCtx)
  }

  // Default to app routes (API, auth, UI) for app subdomain
  return appRouter.fetch(c.req.raw, c.env, c.executionCtx)
})

export default app
