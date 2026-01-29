import { Hono } from 'hono'
import type { Env } from '../../env'
import { createAuth, getSession } from '../../auth'
import { getOrCreateCloudflareAccessUser } from '../../lib/cloudflare-access'
import { getAppBaseUrl, getContentDomain } from '../../lib/domains'
import { isUserAllowed } from '../../lib/access'
import { createContentToken } from '../../lib/content-token'
import { createDbClient } from '../../db/client'
import { canAccessProject } from '../../lib/visibility'
import { getAuthenticatedUser } from '../../lib/api-helpers'

export const authRoutes = new Hono<{ Bindings: Env }>({ strict: false })

// Login route - directly initiates OAuth flow (no client-side JS needed)
authRoutes.get('/login', async (c) => {
  // In cloudflare-access mode, don't use BetterAuth OAuth
  if (c.env.AUTH_MODE === 'cloudflare-access') {
    const cfUser = await getOrCreateCloudflareAccessUser(c.req.raw, c.env)
    if (cfUser) {
      // Check CF user is still allowed
      if (!isUserAllowed(cfUser.email, c.env)) {
        return c.redirect('/error?message=' + encodeURIComponent('Your access has been revoked. Please contact the administrator if you believe this is an error.'))
      }
      // Already authenticated via CF Access, redirect to callback or home
      const callbackURL = c.req.query('callbackURL') || '/'
      return c.redirect(callbackURL)
    }
    // Not authenticated - CF Access should have blocked this request
    return c.text('Cloudflare Access authentication required', 401)
  }

  const auth = createAuth(c.env)
  const session = await getSession(c.req.raw, auth)

  // If already logged in, check they're still allowed before redirecting
  if (session?.user) {
    if (session.user.email && !isUserAllowed(session.user.email, c.env)) {
      // User has been removed from ALLOWED_USERS, show error
      return c.redirect('/error?message=' + encodeURIComponent('Your access has been revoked. Please contact the administrator if you believe this is an error.'))
    }
    const callbackURL = c.req.query('callbackURL') || '/'
    return c.redirect(callbackURL)
  }

  // Initiate OAuth directly via Better Auth API (no client-side JS needed)
  // This saves loading a 430KB React bundle just to redirect
  const callbackURL = c.req.query('callbackURL') || '/'
  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: 'google',
        callbackURL,
      },
    })

    // Better Auth returns an object with url property
    if (result && typeof result === 'object' && 'url' in result && typeof result.url === 'string') {
      return c.redirect(result.url)
    }
  } catch (e) {
    console.error('OAuth initiation failed:', e)
  }

  // Fallback: redirect to error page
  return c.redirect('/error?message=' + encodeURIComponent('Login failed. Please try again.'))
})

// Logout route - redirect to BetterAuth's sign-out endpoint
authRoutes.get('/logout', (c) => {
  const baseURL = getAppBaseUrl(c.env)
  return c.redirect(`${baseURL}/auth/sign-out`)
})

// Custom error page - intercept BetterAuth's /auth/error route
authRoutes.get('/error', (c) => {
  const error = c.req.query('error') || 'Unknown error'

  // Map common error codes to user-friendly messages
  const errorMessages: Record<string, string> = {
    'state_mismatch': 'Authentication failed. Please try logging in again.',
    'unauthorized_user': 'You are not authorized to use this service. Please contact the administrator if you believe this is an error.',
  }

  const message = errorMessages[error] || error.replace(/_/g, ' ')

  return c.redirect('/error?message=' + encodeURIComponent(message))
})

// Project type for DB query
interface Project {
  id: string
  name: string
  namespace: string
  owner_id: string
  visibility: string
}

// Content access token endpoint
// Issues a project-scoped JWT for accessing private content on the pages subdomain
// Flow: pages → app/auth/content-access → pages (with token)
authRoutes.get('/content-access', async (c) => {
  const projectId = c.req.query('project_id')
  const returnUrl = c.req.query('return_url')

  if (!projectId || !returnUrl) {
    return c.redirect('/error?message=' + encodeURIComponent('Missing parameters'))
  }

  // Validate return_url is on our content domain (prevent open redirect)
  try {
    const contentDomain = getContentDomain(c.env)
    const returnUrlParsed = new URL(returnUrl)
    if (returnUrlParsed.host !== contentDomain) {
      return c.redirect('/error?message=' + encodeURIComponent('Invalid return URL'))
    }
  } catch {
    return c.redirect('/error?message=' + encodeURIComponent('Invalid return URL'))
  }

  // Check user is authenticated (supports Bearer tokens for CLI and session cookies for browser)
  const authResult = await getAuthenticatedUser(c)
  const user = authResult?.user ?? null

  if (!user) {
    // Not logged in - redirect to login, then back here
    const baseURL = getAppBaseUrl(c.env)
    const thisUrl = `${baseURL}/auth/content-access?project_id=${encodeURIComponent(projectId)}&return_url=${encodeURIComponent(returnUrl)}`
    return c.redirect(`/auth/login?callbackURL=${encodeURIComponent(thisUrl)}`)
  }

  // Look up project and verify access
  const db = createDbClient(c.env.DB)
  const [project] = (await db`
    SELECT id, name, namespace, owner_id, visibility
    FROM projects WHERE id = ${projectId}
  `) as Project[]

  // Generic error for both "not found" and "no access" (don't reveal existence)
  if (!project || !canAccessProject(user.email, user.id, project, c.env)) {
    return c.redirect('/error?message=' + encodeURIComponent('Unable to access this content'))
  }

  // Generate content token
  const token = await createContentToken(
    user.id,
    user.email,
    projectId,
    c.env.BETTER_AUTH_SECRET
  )

  // Redirect back with token
  const redirectUrl = new URL(returnUrl)
  redirectUrl.searchParams.set('_ctoken', token)

  return c.redirect(redirectUrl.toString())
})

// BetterAuth handler - handles all /auth/* routes including:
// - OAuth callbacks (/auth/callback/google)
// - Device flow (/auth/device/code, /auth/device/token, /auth/device/approve, /auth/device/deny)
// - Session management (/auth/sign-out)
authRoutes.all('/*', async (c) => {
  const path = new URL(c.req.url).pathname

  // In cloudflare-access mode, block OAuth-related routes
  if (c.env.AUTH_MODE === 'cloudflare-access') {
    if (path.startsWith('/auth/sign-in') || path.startsWith('/auth/sign-up')) {
      return c.redirect('/')
    }
  }

  const auth = createAuth(c.env)
  return auth.handler(c.req.raw)
})
