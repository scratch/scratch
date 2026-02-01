// Cache invalidation helpers

import type { Env } from '../env'
import type { AuthResult } from './api-helpers'
import { getContentBaseUrl } from './domains'
import { getEmailLocalPart, isSingleDomainAllowedUsers } from '@scratch/shared/project'

/**
 * Options for building cache base URLs.
 * This interface allows testing without mocking Env.
 */
export interface CacheUrlOptions {
  contentBaseUrl: string
  userId: string
  email: string
  projectName: string
  /** The domain from ALLOWED_USERS if single-domain mode, null otherwise */
  singleDomain: string | null
}

/**
 * Build the list of cache URLs to invalidate for a project.
 *
 * Projects can be accessed via multiple URL patterns:
 * - By user ID: /userId/projectName/
 * - By email: /email@domain.com/projectName/
 * - By local part (single-domain deployments): /localpart/projectName/
 *
 * This function returns all base URLs that need cache invalidation.
 * Exported for testing - use invalidateProjectCache for production code.
 */
export function buildCacheBaseUrlsFromOptions(options: CacheUrlOptions): string[] {
  const { contentBaseUrl, userId, email, projectName, singleDomain } = options
  const normalizedEmail = email.toLowerCase()

  const baseUrls = [
    `${contentBaseUrl}/${userId}/${projectName}`,
    `${contentBaseUrl}/${normalizedEmail}/${projectName}`,
  ]

  if (singleDomain) {
    const localPart = getEmailLocalPart(email)
    if (localPart) {
      baseUrls.push(`${contentBaseUrl}/${localPart}/${projectName}`)
    }
  }

  return baseUrls
}

/**
 * Build the list of cache URLs to invalidate for a project.
 * Convenience wrapper that extracts options from AuthResult and Env.
 */
export function buildCacheBaseUrls(
  auth: AuthResult,
  projectName: string,
  env: Env
): string[] {
  return buildCacheBaseUrlsFromOptions({
    contentBaseUrl: getContentBaseUrl(env),
    userId: auth.userId,
    email: auth.user.email,
    projectName,
    singleDomain: isSingleDomainAllowedUsers(env.ALLOWED_USERS || ''),
  })
}

/**
 * Invalidate cache for a project.
 *
 * Purges common paths (/ and /index.html) for all URL formats that can access
 * the project. This is called after deploys and project deletions.
 */
export async function invalidateProjectCache(
  auth: AuthResult,
  projectName: string,
  env: Env
): Promise<void> {
  const cache = caches.default
  const baseUrls = buildCacheBaseUrls(auth, projectName, env)

  // Purge common paths for all URL formats
  const purgePromises = baseUrls.flatMap((baseUrl) => [
    cache.delete(new Request(`${baseUrl}/`)),
    cache.delete(new Request(`${baseUrl}/index.html`)),
  ])
  await Promise.all(purgePromises)
}
