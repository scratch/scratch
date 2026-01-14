import { betterAuth } from 'better-auth'
import { bearer, deviceAuthorization } from 'better-auth/plugins'
import { APIError } from 'better-auth/api'
import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'
import type { Env } from './env'
import { isUserAllowed } from './lib/access'
import { getAppBaseUrl, useHttps } from './lib/domains'

export type Auth = ReturnType<typeof createAuth>

export function createAuth(env: Env) {
  const isHttps = useHttps(env)
  const baseURL = getAppBaseUrl(env)

  // Create Kysely instance with D1 dialect for BetterAuth
  const db = new Kysely<unknown>({
    dialect: new D1Dialect({ database: env.DB }),
  })

  // Field mappings below convert BetterAuth's camelCase to our snake_case schema.
  // We use snake_case to follow SQL conventions. The alternative would be
  // using camelCase in the schema to eliminate these mappings, but that's
  // unconventional for SQL.
  return betterAuth({
    database: {
      db,
      type: 'sqlite',
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    basePath: '/auth',

    // IMPORTANT: Only trust the app subdomain for CSRF protection
    // Do NOT include content subdomain - that serves user-uploaded content
    // that could contain malicious JavaScript
    trustedOrigins: [baseURL],

    plugins: [
      // Required for CLI to authenticate with Bearer tokens
      bearer(),

      // Device authorization flow (RFC 8628) for CLI login
      deviceAuthorization({
        verificationUri: '/device',  // Our approval page URL
        expiresIn: '10m',            // 10 minutes
        interval: '5s',              // 5 second polling minimum
        userCodeLength: 6,
        deviceCodeLength: 32,

        // Snake_case field mapping for device_code table
        schema: {
          deviceCode: {
            modelName: 'device_code',
            fields: {
              deviceCode: 'device_code',
              userCode: 'user_code',
              userId: 'user_id',
              clientId: 'client_id',
              expiresAt: 'expires_at',
              lastPolledAt: 'last_polled_at',
              pollingInterval: 'polling_interval',
            },
          },
        },
      }),
    ],

    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24 * 30,  // 30 days (good for CLI)
      updateAge: 60 * 60 * 24,       // Refresh if older than 1 day
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,  // 5 minutes - reduces DB queries
      },
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },

    // Session cookies are scoped to app subdomain only (not shared with content subdomain)
    // Content subdomain uses project-scoped content tokens instead
    advanced: {
      useSecureCookies: isHttps,
      defaultCookieAttributes: {
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        httpOnly: true,
        path: '/',
      },
    },

    emailAndPassword: { enabled: false },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },

    // User restriction hook - runs BEFORE user is created
    // This replaces the callback wrapper that checked ALLOWED_USERS after OAuth
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isUserAllowed(user.email, env)) {
              // Use snake_case code as message - BetterAuth passes this to ?error= query param
              throw new APIError('FORBIDDEN', {
                message: 'unauthorized_user',
              })
            }
            return { data: user }
          },
        },
      },
    },

    user: {
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },

    account: {
      // Skip OAuth state cookie check.
      //
      // Why this is needed:
      // Better Auth requires the browser to initiate OAuth via authClient.signIn.social()
      // for proper state cookie handling. Even with database state storage and the official
      // Better Auth client library from CDN, the state cookie is not being sent on the
      // OAuth callback redirect. This appears to be a cross-site cookie restriction issue.
      //
      // Security considerations:
      // - The state parameter prevents OAuth CSRF attacks (attacker initiating OAuth on behalf of victim)
      // - Our device authorization flow provides additional protection for CLI login:
      //   1. User must explicitly visit our URL and enter a device code
      //   2. User must approve the device after authenticating
      //   3. CLI polls with a device_code that the attacker doesn't have
      //
      // See: https://github.com/better-auth/better-auth/discussions/5519
      // See: plan/in-progress/re-enable-state-check.md for full analysis
      skipStateCookieCheck: true,
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        idToken: 'id_token',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },

    verification: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
  })
}

export async function getSession(request: Request, auth: Auth) {
  try {
    return await auth.api.getSession({ headers: request.headers })
  } catch {
    return null
  }
}
