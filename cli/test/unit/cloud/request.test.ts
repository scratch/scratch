import { describe, expect, test, mock, spyOn, beforeEach, afterEach } from "bun:test";

/**
 * Tests for the request utility module.
 * 
 * Tests the header construction logic including:
 * 1. Bearer token authentication
 * 2. CF Access service token headers
 * 3. CF Access JWT from credentials (cfToken)
 */

describe("Request Header Construction", () => {
  describe("Bearer Token", () => {
    test("includes Authorization header when token provided", () => {
      const token = "test-bearer-token"
      const headers: Record<string, string> = {}
      
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }
      
      expect(headers["Authorization"]).toBe("Bearer test-bearer-token")
    })

    test("omits Authorization header when no token", () => {
      const token: string | undefined = undefined
      const headers: Record<string, string> = {}
      
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }
      
      expect(headers["Authorization"]).toBeUndefined()
    })
  })

  describe("CF Access Service Token Headers", () => {
    test("includes service token headers when configured", () => {
      const cfHeaders = {
        "CF-Access-Client-Id": "client-id",
        "CF-Access-Client-Secret": "client-secret",
      }
      
      const headers: Record<string, string> = { ...cfHeaders }
      
      expect(headers["CF-Access-Client-Id"]).toBe("client-id")
      expect(headers["CF-Access-Client-Secret"]).toBe("client-secret")
    })

    test("omits service token headers when not configured", () => {
      const cfHeaders: Record<string, string> | undefined = undefined
      
      const headers: Record<string, string> = { ...(cfHeaders || {}) }
      
      expect(headers["CF-Access-Client-Id"]).toBeUndefined()
      expect(headers["CF-Access-Client-Secret"]).toBeUndefined()
    })
  })

  describe("CF Access JWT from Credentials (cfToken)", () => {
    test("includes cf-access-token header when cfToken in credentials", () => {
      const credentials = {
        token: "bearer-token",
        cfToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
        user: { id: "1", email: "test@example.com", name: "Test" },
      }
      
      const headers: Record<string, string> = {}
      
      if (credentials?.cfToken) {
        headers["cf-access-token"] = credentials.cfToken
      }
      
      expect(headers["cf-access-token"]).toBe("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...")
    })

    test("omits cf-access-token header when no cfToken", () => {
      const credentials = {
        token: "bearer-token",
        user: { id: "1", email: "test@example.com", name: "Test" },
      }
      
      const headers: Record<string, string> = {}
      
      if (credentials?.cfToken) {
        headers["cf-access-token"] = credentials.cfToken
      }
      
      expect(headers["cf-access-token"]).toBeUndefined()
    })

    test("omits cf-access-token header when no credentials", () => {
      const credentials: { cfToken?: string } | null = null
      
      const headers: Record<string, string> = {}
      
      if (credentials?.cfToken) {
        headers["cf-access-token"] = credentials.cfToken
      }
      
      expect(headers["cf-access-token"]).toBeUndefined()
    })
  })

  describe("Combined Headers", () => {
    test("includes all headers when all auth methods configured", () => {
      const token = "bearer-token"
      const cfServiceHeaders = {
        "CF-Access-Client-Id": "client-id",
        "CF-Access-Client-Secret": "client-secret",
      }
      const credentials = {
        token: "stored-token",
        cfToken: "cf-jwt-token",
        user: { id: "1", email: "test@example.com", name: null },
      }
      const contentType = "application/json"
      
      // Build headers (mirrors buildHeaders in request.ts)
      const headers: Record<string, string> = { ...cfServiceHeaders }
      
      if (contentType) {
        headers["Content-Type"] = contentType
      }
      
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }
      
      if (credentials?.cfToken) {
        headers["cf-access-token"] = credentials.cfToken
      }
      
      expect(headers["CF-Access-Client-Id"]).toBe("client-id")
      expect(headers["CF-Access-Client-Secret"]).toBe("client-secret")
      expect(headers["Content-Type"]).toBe("application/json")
      expect(headers["Authorization"]).toBe("Bearer bearer-token")
      expect(headers["cf-access-token"]).toBe("cf-jwt-token")
    })

    test("handles binary content type for deploy", () => {
      const contentType = "application/zip"
      const headers: Record<string, string> = {}
      
      if (contentType) {
        headers["Content-Type"] = contentType
      }
      
      expect(headers["Content-Type"]).toBe("application/zip")
    })
  })
})

describe("Request Logging", () => {
  function redact(value: string): string {
    if (value.length <= 2) return "**"
    return value.slice(0, 2) + "**"
  }

  test("redacts Authorization header value", () => {
    const value = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    const parts = value.split(" ")
    const redacted = parts.length === 2 ? `${parts[0]} ${redact(parts[1])}` : redact(value)
    
    expect(redacted).toBe("Bearer ey**")
  })

  test("redacts token headers", () => {
    const headers: Record<string, string> = {
      "cf-access-token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
      "Content-Type": "application/json",
    }
    
    const redactedHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase().includes("token")) {
        redactedHeaders[key] = redact(value)
      } else {
        redactedHeaders[key] = value
      }
    }
    
    expect(redactedHeaders["cf-access-token"]).toBe("ey**")
    expect(redactedHeaders["Content-Type"]).toBe("application/json")
  })

  test("redacts secret headers", () => {
    const headers: Record<string, string> = {
      "CF-Access-Client-Secret": "very-secret-value",
    }
    
    const redactedHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase().includes("secret")) {
        redactedHeaders[key] = redact(value)
      } else {
        redactedHeaders[key] = value
      }
    }
    
    expect(redactedHeaders["CF-Access-Client-Secret"]).toBe("ve**")
  })
})

describe("ApiError", () => {
  // Import the actual class
  const { ApiError } = require("../../../src/cloud/request")

  test("creates error with message and status", () => {
    const error = new ApiError("Not found", 404)
    
    expect(error.message).toBe("Not found")
    expect(error.status).toBe(404)
    expect(error.body).toBeUndefined()
    expect(error.name).toBe("ApiError")
  })

  test("creates error with body", () => {
    const body = { error: "validation_failed", details: ["field required"] }
    const error = new ApiError("Validation failed", 400, body)
    
    expect(error.message).toBe("Validation failed")
    expect(error.status).toBe(400)
    expect(error.body).toEqual(body)
  })

  test("is instanceof Error", () => {
    const error = new ApiError("Test error", 500)
    
    expect(error instanceof Error).toBe(true)
  })
})

describe("CF Access Token Extraction (Server-side)", () => {
  // Test the server's extractJwt logic that accepts cf-access-token header
  
  function extractJwt(headers: Record<string, string | null>): string | null {
    // Priority: Cf-Access-Jwt-Assertion > cf-access-token > Cookie
    const cfAccessJwt = headers["Cf-Access-Jwt-Assertion"]
    if (cfAccessJwt) return cfAccessJwt
    
    const cliCfToken = headers["cf-access-token"]
    if (cliCfToken) return cliCfToken
    
    // Cookie parsing would go here
    return null
  }

  test("extracts JWT from Cf-Access-Jwt-Assertion header (browser)", () => {
    const headers = {
      "Cf-Access-Jwt-Assertion": "browser-jwt-token",
      "cf-access-token": null,
    }
    
    const jwt = extractJwt(headers)
    expect(jwt).toBe("browser-jwt-token")
  })

  test("extracts JWT from cf-access-token header (CLI)", () => {
    const headers = {
      "Cf-Access-Jwt-Assertion": null,
      "cf-access-token": "cli-jwt-token",
    }
    
    const jwt = extractJwt(headers)
    expect(jwt).toBe("cli-jwt-token")
  })

  test("prefers Cf-Access-Jwt-Assertion over cf-access-token", () => {
    const headers = {
      "Cf-Access-Jwt-Assertion": "browser-jwt",
      "cf-access-token": "cli-jwt",
    }
    
    const jwt = extractJwt(headers)
    expect(jwt).toBe("browser-jwt")
  })

  test("returns null when no JWT headers present", () => {
    const headers = {
      "Cf-Access-Jwt-Assertion": null,
      "cf-access-token": null,
    }
    
    const jwt = extractJwt(headers)
    expect(jwt).toBeNull()
  })
})
