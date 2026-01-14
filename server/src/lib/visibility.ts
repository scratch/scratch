// Visibility checking utilities for project access control
// Works with the Group type from shared/group.ts

import { parseGroup, matchesGroup, groupContains, type Group } from '@scratch/shared'
import type { Env } from '../env'

/**
 * Check if a user can access a project based on:
 * 1. Owner always has access
 * 2. Project visibility check
 * 3. MAX_VISIBILITY ceiling check
 *
 * @param userEmail - The user's email (null if not logged in)
 * @param userId - The user's ID (null if not logged in)
 * @param project - The project to check access for
 * @param env - Environment with MAX_VISIBILITY setting
 * @returns true if user has access
 */
export function canAccessProject(
  userEmail: string | null,
  userId: string | null,
  project: { owner_id: string; visibility: string | null },
  env: Env
): boolean {
  // Owner always has access
  if (userId && userId === project.owner_id) {
    return true
  }

  // Safety: treat null/undefined visibility as 'private' (owner-only)
  if (!project.visibility) {
    return false
  }

  // If not logged in, can only access public projects
  if (!userEmail) {
    return isPublicProject(project.visibility, env)
  }

  // Check project visibility
  const projectVisibility = parseGroup(project.visibility)
  if (!matchesGroup(userEmail, projectVisibility)) {
    return false
  }

  // Check MAX_VISIBILITY ceiling
  const maxVisibility = parseGroup(env.MAX_VISIBILITY)
  if (!matchesGroup(userEmail, maxVisibility)) {
    return false
  }

  return true
}

/**
 * Check if a project is publicly accessible (no auth required)
 * A project is public if BOTH project visibility AND MAX_VISIBILITY are 'public'
 */
export function isPublicProject(projectVisibility: string | null, env: Env): boolean {
  // Safety: treat null/undefined visibility as 'private' (not public)
  if (!projectVisibility) {
    return false
  }

  const visibility = parseGroup(projectVisibility)
  const maxVisibility = parseGroup(env.MAX_VISIBILITY)

  return visibility === 'public' && maxVisibility === 'public'
}

/**
 * Check if a visibility setting exceeds the MAX_VISIBILITY ceiling.
 * Uses groupContains: visibility exceeds max if max doesn't contain visibility.
 *
 * @returns true if the visibility exceeds (is more permissive than) MAX_VISIBILITY
 */
export function visibilityExceedsMax(visibility: Group, env: Env): boolean {
  const maxVisibility = parseGroup(env.MAX_VISIBILITY)
  return !groupContains(maxVisibility, visibility)
}
