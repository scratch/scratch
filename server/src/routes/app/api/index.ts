import { Hono } from 'hono'
import type { Env } from '../../../env'
import { userRoutes } from './users'
import { projectRoutes } from './projects'
import { deployRoutes } from './deploys'
import { shareTokenRoutes } from './share-tokens'
import { getAppBaseUrl } from '../../../lib/domains'
import { isUserAllowed } from '../../../lib/access'
import { createAuth, getSession } from '../../../auth'

export const apiRoutes = new Hono<{ Bindings: Env }>({ strict: false })

// Security middleware for API requests
// Two layers of protection against cross-origin attacks:
//
// 1. Origin validation (defense-in-depth):
//    - Reject requests with Origin header from untrusted domains
//    - Same-origin requests have no Origin header, so we allow those
//    - This protects against malicious JS on pages.scratch.dev making API calls
//
// 2. Content-Type validation:
//    - Require application/json for mutating requests
//    - This triggers CORS preflight, which browsers enforce
//    - Without this, attackers could use <form> to bypass CORS
apiRoutes.use('*', async (c, next) => {
  // Origin validation for cross-origin requests
  // Note: Same-origin requests don't include Origin header, which is fine
  const origin = c.req.header('origin')
  if (origin) {
    const expectedOrigin = getAppBaseUrl(c.env)
    if (origin !== expectedOrigin) {
      return c.json({ error: 'Invalid origin' }, 403)
    }
  }

  // Content-Type validation for methods that have a body
  // This prevents form submissions (which can only send urlencoded/multipart/text)
  // from reaching API endpoints. DELETE is excluded because:
  // 1. Forms can only do GET/POST, not DELETE
  // 2. DELETE requests are protected by Authorization header (triggers CORS preflight)
  const method = c.req.method.toUpperCase()
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = c.req.header('content-type')

    // Allowed content types:
    // - application/json: standard API requests
    // - multipart/form-data: file uploads
    // - application/zip: deploy endpoint
    // All of these trigger CORS preflight (non-simple content types)
    const isAllowed =
      contentType?.includes('application/json') ||
      contentType?.includes('multipart/form-data') ||
      contentType?.includes('application/zip')

    if (!isAllowed) {
      return c.json(
        { error: 'Content-Type must be application/json, multipart/form-data, or application/zip' },
        415
      )
    }
  }

  await next()
})

// ALLOWED_USERS enforcement middleware
// Re-validates existing users against ALLOWED_USERS on every API request
// This ensures users removed from ALLOWED_USERS are immediately locked out
apiRoutes.use('*', async (c, next) => {
  // Skip health check - it's a public endpoint
  if (c.req.path === '/api/health') {
    return next()
  }

  const auth = createAuth(c.env)
  const session = await getSession(c.req.raw, auth)

  // If there's an authenticated user, check they're still allowed
  if (session?.user?.email) {
    if (!isUserAllowed(session.user.email, c.env)) {
      return c.json({ error: 'Your access has been revoked' }, 403)
    }
  }

  await next()
})

// Health check endpoint
apiRoutes.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

// Mount all API routes
apiRoutes.route('/', userRoutes)
apiRoutes.route('/', projectRoutes)
apiRoutes.route('/', deployRoutes)
apiRoutes.route('/', shareTokenRoutes)
