import * as jose from 'jose'
import type { Env } from '../env'
import { createDbClient } from '../db/client'
import { generateId } from './id'

// Cache JWKS for performance (Cloudflare rotates keys every 6 weeks)
let jwksCache: { jwks: jose.JSONWebKeySet; fetchedAt: number } | null = null
const JWKS_CACHE_TTL = 60 * 60 * 1000 // 1 hour

export interface CloudflareAccessIdentity {
  email: string
  sub: string // Cloudflare user ID
}

export interface CloudflareAccessUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

/**
 * Validates a Cloudflare Access JWT and returns the identity claims.
 *
 * @param request - The incoming request (to extract JWT from header/cookie)
 * @param teamName - Your Cloudflare Access team name
 * @returns The identity claims, or null if not authenticated
 */
export async function validateCloudflareAccess(
  request: Request,
  teamName: string
): Promise<CloudflareAccessIdentity | null> {
  const jwt = extractJwt(request)
  if (!jwt) {
    return null
  }

  try {
    const jwks = await getJwks(teamName)
    const JWKS = jose.createLocalJWKSet(jwks)
    const { payload } = await jose.jwtVerify(jwt, JWKS, {
      issuer: `https://${teamName}.cloudflareaccess.com`,
    })

    // Validate required claims
    if (typeof payload.email !== 'string' || typeof payload.sub !== 'string') {
      console.error('Cloudflare Access JWT missing required claims')
      return null
    }

    return {
      email: payload.email,
      sub: payload.sub,
    }
  } catch (error) {
    console.error('Failed to validate Cloudflare Access JWT:', error)
    return null
  }
}

/**
 * Gets or creates a user from Cloudflare Access authentication.
 * Centralizes the user lookup/creation logic to avoid duplication.
 *
 * @param request - The incoming request
 * @param env - Environment variables (must have CLOUDFLARE_ACCESS_TEAM set)
 * @returns The user record, or null if not authenticated
 */
export async function getOrCreateCloudflareAccessUser(
  request: Request,
  env: Env
): Promise<CloudflareAccessUser | null> {
  if (!env.CLOUDFLARE_ACCESS_TEAM) {
    console.error('AUTH_MODE is cloudflare-access but CLOUDFLARE_ACCESS_TEAM is not set')
    return null
  }

  const identity = await validateCloudflareAccess(request, env.CLOUDFLARE_ACCESS_TEAM)
  if (!identity) {
    return null
  }

  const db = createDbClient(env.DB)

  // Look up user by email
  let [user] = (await db`SELECT id, email, name, image FROM "user" WHERE email = ${identity.email}`) as CloudflareAccessUser[]

  if (!user) {
    // Auto-create user on first login via Cloudflare Access
    const userId = generateId()
    const [newUser] = (await db`
      INSERT INTO "user" (id, email, name, email_verified, created_at, updated_at)
      VALUES (${userId}, ${identity.email}, ${identity.email.split('@')[0]}, 1, datetime('now'), datetime('now'))
      RETURNING id, email, name, image
    `) as CloudflareAccessUser[]
    user = newUser
  }

  return user
}

/**
 * Extracts the JWT from the request.
 * Cloudflare Access provides the JWT in multiple places:
 * 1. Cf-Access-Jwt-Assertion header (set by Cloudflare Access proxy)
 * 2. cf-access-token header (set by CLI when using browser-based CF Access auth)
 * 3. CF_Authorization cookie (set by browser after CF Access login)
 */
function extractJwt(request: Request): string | null {
  // Try CF Access proxy header first (most reliable for browser requests)
  const cfAccessJwt = request.headers.get('Cf-Access-Jwt-Assertion')
  if (cfAccessJwt) {
    return cfAccessJwt
  }

  // Try CLI-provided header (for browser-based CF Access auth via localhost callback)
  const cliCfToken = request.headers.get('cf-access-token')
  if (cliCfToken) {
    return cliCfToken
  }

  // Fall back to cookie
  const cookies = request.headers.get('Cookie')
  if (cookies) {
    const match = cookies.match(/CF_Authorization=([^;]+)/)
    if (match) {
      return match[1]
    }
  }

  return null
}

/**
 * Fetches and caches the JWKS from Cloudflare Access.
 */
async function getJwks(teamName: string): Promise<jose.JSONWebKeySet> {
  const now = Date.now()

  // Return cached JWKS if still valid
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.jwks
  }

  const certsUrl = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`
  const response = await fetch(certsUrl)

  if (!response.ok) {
    throw new Error(`Failed to fetch Cloudflare Access certs: ${response.status}`)
  }

  const jwks = (await response.json()) as jose.JSONWebKeySet

  // Cache the JWKS
  jwksCache = { jwks, fetchedAt: now }

  return jwks
}
