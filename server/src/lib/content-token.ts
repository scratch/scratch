// Content tokens - project-scoped JWTs for authenticating access to private content
// on the pages subdomain without sharing session cookies across subdomains.
//
// Security model:
// - App subdomain session cookies are NOT shared with content subdomain
// - When accessing private content, user is redirected to app to get a token
// - Token is project-scoped (can only access the specific project it was issued for)
// - Token includes email to allow access checks without DB lookup

import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'
const ISSUER = 'scratch'
const AUDIENCE = 'content'
const EXPIRY = '1h'

export interface VerifiedContentToken {
  userId: string
  email: string
  projectId: string
}

/**
 * Create a content access token for a specific project.
 *
 * @param userId - The user's ID
 * @param email - The user's email (included to allow access checks without DB lookup)
 * @param projectId - The project this token grants access to
 * @param secret - The signing secret (use BETTER_AUTH_SECRET)
 */
export async function createContentToken(
  userId: string,
  email: string,
  projectId: string,
  secret: string
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret)

  return new SignJWT({ pid: projectId, email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secretKey)
}

/**
 * Verify a content access token.
 *
 * Returns the verified payload if valid, null otherwise.
 * The projectId parameter ensures the token was issued for the project being accessed.
 *
 * @param token - The JWT token to verify
 * @param projectId - The project being accessed (must match token's pid claim)
 * @param secret - The signing secret (use BETTER_AUTH_SECRET)
 */
export async function verifyContentToken(
  token: string,
  projectId: string,
  secret: string
): Promise<VerifiedContentToken | null> {
  try {
    const secretKey = new TextEncoder().encode(secret)

    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    })

    // Verify project ID matches - token is project-scoped
    if (payload.pid !== projectId) {
      return null
    }

    return {
      userId: payload.sub as string,
      email: payload.email as string,
      projectId: payload.pid as string,
    }
  } catch {
    // Invalid signature, expired, wrong issuer/audience, etc.
    return null
  }
}
