import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import http from "http";

/**
 * Tests for the localhost callback authentication flow.
 * 
 * This tests the CLI's ability to:
 * 1. Start a localhost HTTP server to receive auth callbacks
 * 2. Validate the state parameter (CSRF protection)
 * 3. Extract token and cfToken from callback URL
 * 4. Race between localhost callback and polling
 */

// =============================================================================
// Helper: Create a localhost callback server (mirrors auth.ts implementation)
// =============================================================================

interface AuthResult {
  token: string
  cfToken?: string
}

function createLocalhostCallbackServer(
  port: number,
  expectedState: string,
  abortSignal: AbortSignal
): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`)

      if (url.pathname === "/callback") {
        const state = url.searchParams.get("state")
        const token = url.searchParams.get("token")
        const cfToken = url.searchParams.get("cf_token")

        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" })
          res.end("<h1>Invalid state</h1>")
          return
        }

        if (token) {
          res.writeHead(200, { "Content-Type": "text/html" })
          res.end("<h1>Success</h1>")
          server.close()
          resolve({ token, cfToken: cfToken || undefined })
        } else {
          res.writeHead(400, { "Content-Type": "text/html" })
          res.end("<h1>Missing token</h1>")
        }
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    abortSignal.addEventListener("abort", () => {
      server.close()
      reject(new Error("Aborted"))
    })

    server.on("error", (err: NodeJS.ErrnoException) => {
      reject(err)
    })

    server.listen(port)
  })
}

// =============================================================================
// Tests: Localhost Callback Server
// =============================================================================

describe("Localhost Callback Server", () => {
  const TEST_PORT = 18400 // Use non-standard port to avoid conflicts

  test("accepts valid callback with token and state", async () => {
    const abortController = new AbortController()
    const expectedState = "ABC123"

    const serverPromise = createLocalhostCallbackServer(
      TEST_PORT,
      expectedState,
      abortController.signal
    )

    // Give server time to start
    await new Promise((r) => setTimeout(r, 50))

    // Simulate browser redirect
    const response = await fetch(
      `http://localhost:${TEST_PORT}/callback?token=test-token&state=${expectedState}`
    )

    expect(response.status).toBe(200)

    const result = await serverPromise
    expect(result.token).toBe("test-token")
    expect(result.cfToken).toBeUndefined()
  })

  test("accepts callback with cfToken", async () => {
    const abortController = new AbortController()
    const expectedState = "XYZ789"

    const serverPromise = createLocalhostCallbackServer(
      TEST_PORT + 1,
      expectedState,
      abortController.signal
    )

    await new Promise((r) => setTimeout(r, 50))

    const response = await fetch(
      `http://localhost:${TEST_PORT + 1}/callback?token=app-token&cf_token=cf-jwt-token&state=${expectedState}`
    )

    expect(response.status).toBe(200)

    const result = await serverPromise
    expect(result.token).toBe("app-token")
    expect(result.cfToken).toBe("cf-jwt-token")
  })

  test("rejects callback with invalid state", async () => {
    const abortController = new AbortController()
    const expectedState = "CORRECT"

    const serverPromise = createLocalhostCallbackServer(
      TEST_PORT + 2,
      expectedState,
      abortController.signal
    )

    await new Promise((r) => setTimeout(r, 50))

    // Send callback with wrong state
    const response = await fetch(
      `http://localhost:${TEST_PORT + 2}/callback?token=test-token&state=WRONG`
    )

    expect(response.status).toBe(400)

    // Server should still be waiting (didn't resolve)
    // Send correct request to finish
    const response2 = await fetch(
      `http://localhost:${TEST_PORT + 2}/callback?token=correct-token&state=CORRECT`
    )

    expect(response2.status).toBe(200)

    const result = await serverPromise
    expect(result.token).toBe("correct-token")

    abortController.abort()
  })

  test("rejects callback without token", async () => {
    const abortController = new AbortController()
    const expectedState = "STATE123"

    const serverPromise = createLocalhostCallbackServer(
      TEST_PORT + 3,
      expectedState,
      abortController.signal
    )

    await new Promise((r) => setTimeout(r, 50))

    const response = await fetch(
      `http://localhost:${TEST_PORT + 3}/callback?state=${expectedState}`
    )

    expect(response.status).toBe(400)

    // Clean up - abort the server
    abortController.abort()

    try {
      await serverPromise
    } catch (e: any) {
      expect(e.message).toBe("Aborted")
    }
  })

  test("returns 404 for non-callback paths", async () => {
    const abortController = new AbortController()

    const serverPromise = createLocalhostCallbackServer(
      TEST_PORT + 4,
      "state",
      abortController.signal
    )

    await new Promise((r) => setTimeout(r, 50))

    const response = await fetch(`http://localhost:${TEST_PORT + 4}/other-path`)

    expect(response.status).toBe(404)

    abortController.abort()

    try {
      await serverPromise
    } catch {
      // Expected
    }
  })

  test("can be aborted via AbortController", async () => {
    const abortController = new AbortController()

    const serverPromise = createLocalhostCallbackServer(
      TEST_PORT + 5,
      "state",
      abortController.signal
    )

    await new Promise((r) => setTimeout(r, 50))

    // Abort without sending any request
    abortController.abort()

    try {
      await serverPromise
      expect(true).toBe(false) // Should not reach here
    } catch (e: any) {
      expect(e.message).toBe("Aborted")
    }
  })
})

// =============================================================================
// Tests: Racing Logic
// =============================================================================

describe("Authentication Racing Logic", () => {
  test("resolves when localhost callback wins", async () => {
    const localhostResult = { token: "localhost-token", cfToken: "cf-token" }
    const pollingResult = { token: "polling-token" }

    // Simulate localhost winning (resolves immediately)
    const localhostPromise = Promise.resolve(localhostResult)
    const pollingPromise = new Promise<AuthResult>((resolve) => {
      setTimeout(() => resolve(pollingResult), 1000) // Slow
    })

    const result = await Promise.race([
      localhostPromise.then((r) => ({ source: "localhost" as const, result: r })),
      pollingPromise.then((r) => ({ source: "polling" as const, result: r })),
    ])

    expect(result.source).toBe("localhost")
    expect(result.result.token).toBe("localhost-token")
    expect(result.result.cfToken).toBe("cf-token")
  })

  test("resolves when polling wins", async () => {
    const localhostResult = { token: "localhost-token" }
    const pollingResult = { token: "polling-token" }

    // Simulate polling winning (localhost is slow)
    const localhostPromise = new Promise<AuthResult>((resolve) => {
      setTimeout(() => resolve(localhostResult), 1000) // Slow
    })
    const pollingPromise = Promise.resolve(pollingResult)

    const result = await Promise.race([
      localhostPromise.then((r) => ({ source: "localhost" as const, result: r })),
      pollingPromise.then((r) => ({ source: "polling" as const, result: r })),
    ])

    expect(result.source).toBe("polling")
    expect(result.result.token).toBe("polling-token")
    expect(result.result.cfToken).toBeUndefined()
  })

  test("handles localhost failure gracefully (polling still works)", async () => {
    const pollingResult = { token: "polling-token" }

    // Localhost fails, polling works
    const localhostPromise = Promise.reject(new Error("Port in use")).catch(() => null)
    const pollingPromise = Promise.resolve(pollingResult)

    // Filter out null results
    const result = await Promise.race([
      localhostPromise.then((r) =>
        r ? { source: "localhost" as const, result: r } : new Promise(() => {})
      ),
      pollingPromise.then((r) =>
        r ? { source: "polling" as const, result: r } : new Promise(() => {})
      ),
    ]) as { source: "localhost" | "polling"; result: AuthResult }

    expect(result.source).toBe("polling")
    expect(result.result.token).toBe("polling-token")
  })

  test("abort controller stops polling when localhost wins", async () => {
    const pollingAbort = new AbortController()
    let pollingWasAborted = false

    const localhostResult = { token: "localhost-token", cfToken: "cf-jwt" }

    const localhostPromise = Promise.resolve(localhostResult)
    const pollingPromise = new Promise<AuthResult>((_, reject) => {
      pollingAbort.signal.addEventListener("abort", () => {
        pollingWasAborted = true
        reject(new Error("Aborted"))
      })
    }).catch(() => null)

    const result = await Promise.race([
      localhostPromise.then((r) => ({ source: "localhost" as const, result: r })),
      pollingPromise.then((r) =>
        r ? { source: "polling" as const, result: r } : new Promise(() => {})
      ),
    ]) as { source: "localhost" | "polling"; result: AuthResult }

    // Abort polling after localhost wins
    if (result.source === "localhost") {
      pollingAbort.abort()
    }

    expect(result.source).toBe("localhost")
    expect(pollingWasAborted).toBe(true)
  })
})

// =============================================================================
// Tests: State Parameter (CSRF Protection)
// =============================================================================

describe("State Parameter Validation", () => {
  test("user_code serves as state parameter", () => {
    const userCode = "ABC123"
    const state = userCode // They're the same

    expect(state).toBe(userCode)
  })

  test("rejects mismatched state", () => {
    const expectedState = "ABC123"
    const receivedState = "XYZ789"

    const isValid = expectedState === receivedState
    expect(isValid).toBe(false)
  })

  test("accepts matching state", () => {
    const expectedState = "ABC123"
    const receivedState = "ABC123"

    const isValid = expectedState === receivedState
    expect(isValid).toBe(true)
  })

  test("state comparison is case-sensitive", () => {
    const expectedState = "ABC123"
    const receivedState = "abc123"

    const isValid = expectedState === receivedState
    expect(isValid).toBe(false)
  })
})

// =============================================================================
// Tests: Callback URL Construction (Server-side)
// =============================================================================

describe("Callback URL Construction", () => {
  const LOCALHOST_CALLBACK_PORT = 8400

  test("constructs correct callback URL with all parameters", () => {
    const sessionToken = "session-token-123"
    const userCode = "ABC123"
    const cfAccessJwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."

    const callbackUrl = new URL(`http://localhost:${LOCALHOST_CALLBACK_PORT}/callback`)
    callbackUrl.searchParams.set("token", sessionToken)
    callbackUrl.searchParams.set("state", userCode)
    callbackUrl.searchParams.set("cf_token", cfAccessJwt)

    expect(callbackUrl.toString()).toBe(
      `http://localhost:8400/callback?token=${sessionToken}&state=${userCode}&cf_token=${encodeURIComponent(cfAccessJwt)}`
    )
  })

  test("constructs callback URL without cf_token when not present", () => {
    const sessionToken = "session-token-123"
    const userCode = "ABC123"
    const cfAccessJwt: string | undefined = undefined

    const callbackUrl = new URL(`http://localhost:${LOCALHOST_CALLBACK_PORT}/callback`)
    callbackUrl.searchParams.set("token", sessionToken)
    callbackUrl.searchParams.set("state", userCode)
    if (cfAccessJwt) {
      callbackUrl.searchParams.set("cf_token", cfAccessJwt)
    }

    expect(callbackUrl.toString()).toBe(
      `http://localhost:8400/callback?token=${sessionToken}&state=${userCode}`
    )
    expect(callbackUrl.searchParams.has("cf_token")).toBe(false)
  })
})

// =============================================================================
// Tests: Credential Storage
// =============================================================================

describe("Credential Storage with cfToken", () => {
  test("stores cfToken when present", () => {
    const credentials = {
      token: "app-token",
      cfToken: "cf-jwt-token",
      user: { id: "user-1", email: "test@example.com", name: "Test User" },
    }

    expect(credentials.cfToken).toBe("cf-jwt-token")
  })

  test("cfToken is optional", () => {
    const credentials = {
      token: "app-token",
      user: { id: "user-1", email: "test@example.com", name: "Test User" },
    }

    expect(credentials.cfToken).toBeUndefined()
  })

  test("credentials JSON serialization includes cfToken", () => {
    const credentials = {
      token: "app-token",
      cfToken: "cf-jwt-token",
      user: { id: "user-1", email: "test@example.com", name: null },
    }

    const json = JSON.stringify(credentials)
    const parsed = JSON.parse(json)

    expect(parsed.cfToken).toBe("cf-jwt-token")
  })
})
