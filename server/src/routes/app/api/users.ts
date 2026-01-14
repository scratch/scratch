import { Hono } from 'hono'
import type { Env } from '../../../env'
import { getAuthenticatedUser } from '../../../lib/api-helpers'

export const userRoutes = new Hono<{ Bindings: Env }>({ strict: true })

// GET /api/me - Current user info
userRoutes.get('/me', async (c) => {
  const auth = await getAuthenticatedUser(c)
  if (!auth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }
  return c.json({ user: auth.user })
})
