import { parseGroup, matchesGroup } from '@scratch/shared'
import type { Env } from '../env'

export function isUserAllowed(email: string, env: Env): boolean {
  const allowedUsers = parseGroup(env.ALLOWED_USERS || 'public')
  return matchesGroup(email, allowedUsers)
}
