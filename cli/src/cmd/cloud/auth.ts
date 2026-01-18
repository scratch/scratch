import http from 'http'
import log from '../../logger'
import { getCurrentUser, CfAccessError } from '../../cloud/api'
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
} from '../../config'
import { CloudContext } from './context'
import { prompt, openBrowser } from '../../util'
import { saveCfAccessCredentials } from '../../config'
import { renderSuccessPage, renderErrorPage } from './ui'

// Port for localhost callback (must match server)
const LOCALHOST_CALLBACK_PORT = 8400

// Result from auth callback
interface AuthResult {
  token: string
  cfToken?: string  // CF Access JWT (only present when server uses cloudflare-access mode)
}

/**
 * Generate a random 6-character verification code (uppercase letters + digits).
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude confusing chars: I, O, 0, 1
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * Start a localhost HTTP server to receive the auth callback.
 * Returns a promise that resolves when a valid callback is received.
 */
function waitForCallback(
  port: number,
  expectedState: string,
  timeoutMs: number
): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`)

      if (url.pathname === '/callback') {
        const state = url.searchParams.get('state')
        const token = url.searchParams.get('token')
        const cfToken = url.searchParams.get('cf_token')
        const error = url.searchParams.get('error')

        // Check for error from server
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderErrorPage(error))
          server.close()
          reject(new Error(error))
          return
        }

        // Validate state (CSRF protection)
        if (state !== expectedState) {
          log.debug(`Invalid state received: ${state}, expected: ${expectedState}`)
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderErrorPage('Invalid state. Please try logging in again.'))
          return // Keep waiting for valid callback
        }

        if (token) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderSuccessPage())
          server.close()
          resolve({ token, cfToken: cfToken || undefined })
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderErrorPage('Missing token. Please try logging in again.'))
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderErrorPage('Page not found'))
      }
    })

    // Timeout
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Login timed out. Please try again.'))
    }, timeoutMs)

    // Handle server errors
    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Close other applications using this port and try again.`))
      } else {
        reject(err)
      }
    })

    server.on('close', () => {
      clearTimeout(timeout)
    })

    server.listen(port, () => {
      log.debug(`Callback server listening on port ${port}`)
    })
  })
}

export interface LoginOptions {
  timeout?: number // timeout in minutes
}

export async function loginCommand(ctx: CloudContext, options?: LoginOptions): Promise<void>
export async function loginCommand(serverUrlOverride: string, options?: LoginOptions): Promise<void>
export async function loginCommand(ctxOrServerUrl: CloudContext | string, options?: LoginOptions): Promise<void> {
  const serverUrl = typeof ctxOrServerUrl === 'string'
    ? ctxOrServerUrl
    : await ctxOrServerUrl.getServerUrl()
  const timeoutMs = (options?.timeout ?? 10) * 60 * 1000

  // Check if already logged in
  const existing = await loadCredentials(serverUrl)
  if (existing) {
    log.debug('Found existing credentials, verifying...')
    try {
      const { user } = await getCurrentUser(existing.token, {
        serverUrl,
        skipCfAccessPrompt: true,
      })
      log.info(`Already logged in as ${user.email}`)
      log.info('Use "scratch logout" to log out first')
      return
    } catch (error: any) {
      if (error instanceof CfAccessError) {
        // CF Access blocked the request - handle based on whether service tokens exist
        if (error.hadServiceToken) {
          // Service tokens exist but are expired/invalid
          log.info('Cloudflare Access service token expired or invalid.')
          const choice = await prompt('Update service token or log in with browser? [s/B]')
          if (choice?.toLowerCase() === 's') {
            // User wants to update service token
            const ctx = new CloudContext({ serverUrl })
            await cfAccessCommand(ctx)
            // Retry login after updating service token
            return loginCommand(serverUrl, options)
          }
          // Otherwise proceed to browser login (default)
          log.info('Proceeding to browser login...')
        } else {
          // No service tokens - proceed to browser login (browser will handle CF Access)
          log.debug('Server requires CF Access, proceeding to browser login...')
        }
      } else if (error.status === 401) {
        await clearCredentials(serverUrl)
        log.info('Session expired, logging in again...')
      } else {
        throw error
      }
    }
  }

  log.info(`Logging in to ${serverUrl}`)

  // Generate state (for CSRF protection) and verification code (for user verification)
  const state = crypto.randomUUID()
  const code = generateCode()

  // Build login URL
  const loginUrl = `${serverUrl}/cli-login?state=${state}&code=${code}`

  // Display code to user
  log.info('')
  log.info('Your verification code is:')
  log.info('')
  log.info(`    ${code}`)
  log.info('')
  log.info('Opening browser to complete authentication...')
  log.info(`(If browser doesn't open, visit: ${loginUrl})`)
  log.info('')

  // Start callback server and open browser
  const callbackPromise = waitForCallback(LOCALHOST_CALLBACK_PORT, state, timeoutMs)
  await openBrowser(loginUrl)

  log.info('Waiting for approval in browser...')

  // Wait for callback
  let result: AuthResult
  try {
    result = await callbackPromise
  } catch (err: any) {
    throw new Error(`Login failed: ${err.message}`)
  }

  // Save credentials with placeholder user (so cfToken is available for /api/me request)
  await saveCredentials({
    token: result.token,
    cfToken: result.cfToken,
    user: { id: 'pending', email: 'pending@localhost', name: null },
  }, serverUrl)

  // Fetch actual user info
  const { user } = await getCurrentUser(result.token, { serverUrl })

  // Update credentials with real user info
  await saveCredentials({
    token: result.token,
    cfToken: result.cfToken,
    user: { id: user.id, email: user.email, name: user.name },
  }, serverUrl)

  log.info('')
  log.info(`Logged in as ${user.email}`)

  if (typeof ctxOrServerUrl !== 'string') {
    ctxOrServerUrl.clearCache()
  }
}

export async function logoutCommand(ctx: CloudContext): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await loadCredentials(serverUrl)

  if (!credentials) {
    log.info(`Not logged in to ${serverUrl}`)
    return
  }

  await clearCredentials(serverUrl)
  ctx.clearCache()
  log.info(`Logged out from ${serverUrl}`)
}

export async function whoamiCommand(ctx: CloudContext): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await loadCredentials(serverUrl)

  if (!credentials) {
    log.info(`Not logged in to ${serverUrl}`)
    return
  }

  try {
    const { user } = await getCurrentUser(credentials.token, {
      serverUrl,
      skipCfAccessPrompt: true,
    })
    log.info(`Email: ${user.email}`)
    if (user.name) {
      log.info(`Name:  ${user.name}`)
    }
    log.info(`Server: ${serverUrl}`)
  } catch (error: any) {
    if (error instanceof CfAccessError) {
      // CF Access blocked the request - credentials may be stale or missing CF token
      log.error('Unable to reach server (Cloudflare Access). Please log in again.')
      await clearCredentials(serverUrl)
      ctx.clearCache()
      process.exit(1)
    }
    if (error.status === 401) {
      log.error('Session expired. Please log in again.')
      await clearCredentials(serverUrl)
      ctx.clearCache()
      process.exit(1)
    }
    throw error
  }
}

export async function cfAccessCommand(ctx: CloudContext): Promise<void> {
  const serverUrl = await ctx.getServerUrl()

  log.info('')
  log.info(`Configure Cloudflare Access service token for ${serverUrl}`)
  log.info('Get these values from Cloudflare Zero Trust dashboard:')
  log.info('Access → Service Auth → Service Tokens')
  log.info('')

  const clientId = await prompt('Client ID')
  if (!clientId) {
    throw new Error('Client ID is required')
  }

  const clientSecret = await prompt('Client Secret')
  if (!clientSecret) {
    throw new Error('Client Secret is required')
  }

  await saveCfAccessCredentials(clientId, clientSecret, serverUrl)
  ctx.clearCache()

  log.info('')
  log.info(`Cloudflare Access credentials saved for ${serverUrl}`)
}
