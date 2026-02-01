import { Hono } from 'hono'
import type { Env } from '../../env'
import { createAuth } from '../../auth'
import { createDbClient } from '../../db/client'
import { getAppBaseUrl } from '../../lib/domains'
import { isUserAllowed } from '../../lib/access'
import { createSessionForUser } from '../../lib/session'
import { getAuthenticatedUser } from '../../lib/api-helpers'
import { buildLocalhostCallbackUrl } from '../../lib/url-helpers'
import {
  renderHomePage,
  renderErrorPage,
  renderDevicePage,
  renderDeviceErrorPage,
  renderDeviceSuccessPage,
} from '../../lib/ui'

// Port for CLI localhost callback (must match CLI)
const LOCALHOST_CALLBACK_PORT = 8400

export const uiRoutes = new Hono<{ Bindings: Env }>({ strict: false })

// Helper to return HTML response with appropriate headers
function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-cache',
    },
  })
}

// Home page - server-rendered, zero JS
uiRoutes.get('/', async (c) => {
  const auth = await getAuthenticatedUser(c)
  return html(renderHomePage(auth?.user ?? null))
})

// Error page - server-rendered, zero JS
uiRoutes.get('/error', (c) => {
  const message = c.req.query('message') || 'Something went wrong'
  return html(renderErrorPage(message), 400)
})

// CLI login - simple browser-based auth for CLI
// Works in both auth modes (BetterAuth and Cloudflare Access)
uiRoutes.get('/cli-login', async (c) => {
  const state = c.req.query('state')
  const code = c.req.query('code')

  if (!state || !code) {
    return html(renderErrorPage('Missing state or code parameter'), 400)
  }

  const auth = await getAuthenticatedUser(c)

  // If not logged in, redirect to login (BetterAuth mode only)
  if (!auth) {
    if (c.env.AUTH_MODE === 'cloudflare-access') {
      // CF Access should have authenticated - something is wrong
      return html(renderDeviceErrorPage('Not authenticated via Cloudflare Access'), 401)
    }
    // Redirect to OAuth login, then return here
    const baseURL = getAppBaseUrl(c.env)
    const returnUrl = encodeURIComponent(`${baseURL}/cli-login?state=${state}&code=${code}`)
    return c.redirect(`/auth/login?callbackURL=${returnUrl}`)
  }

  // Check user is allowed
  if (!isUserAllowed(auth.user.email, c.env)) {
    return html(renderDeviceErrorPage('Access denied'), 403)
  }

  // Show approval page with code
  return html(renderDevicePage(code, auth.user.email, state))
})

// CLI login form submission - creates session and redirects to CLI
uiRoutes.post('/cli-login', async (c) => {
  const auth = await getAuthenticatedUser(c)

  if (!auth) {
    return html(renderDeviceErrorPage('Not authenticated'), 401)
  }

  const formData = await c.req.formData()
  const state = formData.get('state') as string
  const code = formData.get('code') as string
  const action = formData.get('action') as string

  if (!state || !code) {
    return html(renderDeviceErrorPage('Missing state or code'), 400)
  }

  // Handle denial
  if (action === 'deny') {
    return c.redirect(buildLocalhostCallbackUrl(LOCALHOST_CALLBACK_PORT, {
      state,
      error: 'access_denied',
    }))
  }

  // Create session token for CLI
  const db = createDbClient(c.env.DB)
  const sessionToken = await createSessionForUser(db, auth.userId)

  // Build callback URL params
  const callbackParams: Record<string, string> = { token: sessionToken, state }

  // Include CF Access JWT if present (for CF Access mode)
  const cfAccessJwt = c.req.header('Cf-Access-Jwt-Assertion')
  if (cfAccessJwt) {
    callbackParams.cf_token = cfAccessJwt
  }

  return c.redirect(buildLocalhostCallbackUrl(LOCALHOST_CALLBACK_PORT, callbackParams))
})

// Device approval page - server-rendered, zero JS
// AUTH_MODE=local: Shows device approval UI (user must click "Approve")
// AUTH_MODE=cloudflare-access: Auto-approves and redirects to localhost with token
uiRoutes.get('/device', async (c) => {
  const userCode = c.req.query('user_code')
  if (!userCode) {
    return html(renderDeviceErrorPage('Missing verification code'), 400)
  }

  const auth = await getAuthenticatedUser(c)

  // If not logged in, redirect to login
  if (!auth) {
    if (c.env.AUTH_MODE === 'cloudflare-access') {
      return html(renderDeviceErrorPage('Not authenticated'), 401)
    }
    const baseURL = getAppBaseUrl(c.env)
    const returnUrl = encodeURIComponent(`${baseURL}/device?user_code=${userCode}`)
    return c.redirect(`/auth/login?callbackURL=${returnUrl}`)
  }

  // Validate the device code exists and is pending
  const db = createDbClient(c.env.DB)
  const [deviceRow] = await db`
    SELECT id, status FROM device_code
    WHERE user_code = ${userCode} AND status = 'pending' AND expires_at > datetime('now')
  ` as { id: string, status: string }[]

  if (!deviceRow) {
    return html(renderDeviceErrorPage('Code not found or expired'), 400)
  }

  // CF Access mode: user is already authenticated via Cloudflare Access
  // Auto-approve and redirect to localhost callback with token
  if (c.env.AUTH_MODE === 'cloudflare-access') {
    // Check user is allowed (defense in depth - CF Access should already enforce this)
    if (!isUserAllowed(auth.user.email, c.env)) {
      return html(renderDeviceErrorPage('Access denied'), 403)
    }

    // Create a session token for the CLI
    const sessionToken = await createSessionForUser(
      db,
      auth.userId,
      c.req.header('User-Agent')
    )

    // Mark device code as approved (for consistency, though CLI will use localhost callback)
    await db`
      UPDATE device_code
      SET status = 'approved', user_id = ${auth.userId}, updated_at = datetime('now')
      WHERE id = ${deviceRow.id}
    `

    // Extract CF Access JWT to pass to CLI (for subsequent API requests behind CF Access)
    const cfAccessJwt = c.req.header('Cf-Access-Jwt-Assertion')

    // Redirect to localhost callback, using user_code as state for CSRF protection
    const callbackParams: Record<string, string> = { token: sessionToken, state: userCode }
    if (cfAccessJwt) {
      callbackParams.cf_token = cfAccessJwt
    }

    return c.redirect(buildLocalhostCallbackUrl(LOCALHOST_CALLBACK_PORT, callbackParams))
  }

  // Local mode: render device approval page (user must click "Approve")
  return html(renderDevicePage(userCode, auth.user.email))
})

// Device approval form submission
uiRoutes.post('/device', async (c) => {
  const auth = await getAuthenticatedUser(c)

  if (!auth) {
    return html(renderDeviceErrorPage('Not authenticated'), 401)
  }

  const formData = await c.req.formData()
  const userCode = formData.get('user_code') as string
  const action = formData.get('action') as string

  if (!userCode || !['approve', 'deny'].includes(action)) {
    return html(renderDeviceErrorPage('Invalid request'), 400)
  }

  try {
    if (c.env.AUTH_MODE === 'cloudflare-access') {
      // In cloudflare-access mode, BetterAuth's deviceApprove/deviceDeny won't work
      // because there's no BetterAuth session. Manually update the device code instead.
      const db = createDbClient(c.env.DB)
      const newStatus = action === 'approve' ? 'approved' : 'denied'

      const result = await db`
        UPDATE device_code
        SET status = ${newStatus}, user_id = ${action === 'approve' ? auth.userId : null}
        WHERE user_code = ${userCode} AND status = 'pending' AND expires_at > datetime('now')
        RETURNING id
      ` as { id: string }[]

      if (result.length === 0) {
        return html(renderDeviceErrorPage('Code not found or expired'), 400)
      }

      return c.redirect(`/device-success?result=${action === 'approve' ? 'approved' : 'denied'}`)
    }

    // Standard BetterAuth mode - use the API
    const betterAuth = createAuth(c.env)

    if (action === 'approve') {
      await betterAuth.api.deviceApprove({
        body: { userCode },
        headers: c.req.raw.headers,
      })
      return c.redirect('/device-success?result=approved')
    } else {
      await betterAuth.api.deviceDeny({
        body: { userCode },
        headers: c.req.raw.headers,
      })
      return c.redirect('/device-success?result=denied')
    }
  } catch (e) {
    console.error('Device approval/denial failed:', e)
    return html(renderDeviceErrorPage('Failed to process request'), 500)
  }
})

// Device success page - server-rendered, zero JS
uiRoutes.get('/device-success', (c) => {
  const result = c.req.query('result')
  const approved = result === 'approved'
  return html(renderDeviceSuccessPage(approved))
})

// Login page is no longer needed - /auth/login redirects directly to OAuth
// But handle it gracefully in case someone navigates here directly
uiRoutes.get('/login', (c) => {
  // Redirect to auth/login which will initiate OAuth
  const callbackURL = c.req.query('callbackURL') || '/'
  return c.redirect(`/auth/login?callbackURL=${encodeURIComponent(callbackURL)}`)
})

// Catch-all: return 404 for unknown paths
uiRoutes.all('*', (c) => {
  return html(renderErrorPage('Page not found'), 404)
})
