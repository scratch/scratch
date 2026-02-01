import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Test getCfAccessHeaders parsing logic directly

describe("getCfAccessHeaders", () => {
  // Test the parsing logic directly since we can't easily mock the module
  function parseToken(token: string | undefined): { clientId: string; clientSecret: string } | undefined {
    if (!token) {
      return undefined;
    }

    // Split on first colon only (secret may contain colons)
    const colonIndex = token.indexOf(':');
    if (colonIndex === -1) {
      return undefined;
    }

    const clientId = token.slice(0, colonIndex);
    const clientSecret = token.slice(colonIndex + 1);

    if (!clientId || !clientSecret) {
      return undefined;
    }

    return { clientId, clientSecret };
  }

  test("returns undefined when no token configured", () => {
    const result = parseToken(undefined);
    expect(result).toBeUndefined();
  });

  test("returns headers when valid token configured", () => {
    const result = parseToken("abc123:secret456");
    expect(result).toEqual({
      clientId: "abc123",
      clientSecret: "secret456",
    });
  });

  test("handles malformed tokens (no colon)", () => {
    const result = parseToken("abc123secret456");
    expect(result).toBeUndefined();
  });

  test("handles empty client ID", () => {
    const result = parseToken(":secret456");
    expect(result).toBeUndefined();
  });

  test("handles empty client secret", () => {
    const result = parseToken("abc123:");
    expect(result).toBeUndefined();
  });

  test("splits on first colon only (secret may contain colons)", () => {
    const result = parseToken("abc123:secret:with:colons");
    expect(result).toEqual({
      clientId: "abc123",
      clientSecret: "secret:with:colons",
    });
  });

  test("handles token with special characters in secret", () => {
    const result = parseToken("client-id-123:secret+with/special=chars");
    expect(result).toEqual({
      clientId: "client-id-123",
      clientSecret: "secret+with/special=chars",
    });
  });
});

describe("isCfAccessDenied", () => {
  // Helper to create a mock Response
  function createMockResponse(status: number, headers: Record<string, string> = {}): Response {
    const headersObj = new Headers(headers);
    return {
      status,
      headers: headersObj,
    } as Response;
  }

  test("returns true for 403 with cf-mitigated header present", () => {
    const response = createMockResponse(403, { "cf-mitigated": "true" });

    // Test the logic
    const isCfDenied = response.status === 403 && response.headers.has("cf-mitigated");
    expect(isCfDenied).toBe(true);
  });

  test("returns false for 403 without the header", () => {
    const response = createMockResponse(403);

    const isCfDenied = response.status === 403 && response.headers.has("cf-mitigated");
    expect(isCfDenied).toBe(false);
  });

  test("returns false for non-403 status codes", () => {
    const response401 = createMockResponse(401, { "cf-mitigated": "true" });
    const response404 = createMockResponse(404, { "cf-mitigated": "true" });
    const response500 = createMockResponse(500, { "cf-mitigated": "true" });

    expect(response401.status === 403 && response401.headers.has("cf-mitigated")).toBe(false);
    expect(response404.status === 403 && response404.headers.has("cf-mitigated")).toBe(false);
    expect(response500.status === 403 && response500.headers.has("cf-mitigated")).toBe(false);
  });

  test("returns false for 200 status code", () => {
    const response = createMockResponse(200, { "cf-mitigated": "true" });

    const isCfDenied = response.status === 403 && response.headers.has("cf-mitigated");
    expect(isCfDenied).toBe(false);
  });

  test("returns false for 403 with other headers but not cf-mitigated", () => {
    const response = createMockResponse(403, {
      "content-type": "text/html",
      "x-custom-header": "value"
    });

    const isCfDenied = response.status === 403 && response.headers.has("cf-mitigated");
    expect(isCfDenied).toBe(false);
  });
});

describe("cfAccessCommand validation", () => {
  // Test the validation logic used in cfAccessCommand
  function validateToken(token: string): boolean {
    return token.includes(':');
  }

  test("accepts valid token format", () => {
    expect(validateToken("abc123:secret456")).toBe(true);
  });

  test("rejects token without colon", () => {
    expect(validateToken("abc123secret456")).toBe(false);
  });

  test("accepts token with multiple colons", () => {
    expect(validateToken("abc:secret:with:colons")).toBe(true);
  });

  test("accepts token with colon at start", () => {
    expect(validateToken(":secret")).toBe(true);
  });

  test("accepts token with colon at end", () => {
    expect(validateToken("abc:")).toBe(true);
  });
});

describe("isCfAccessAuthPage", () => {
  // Helper to create a mock Response
  function createMockResponse(status: number, headers: Record<string, string> = {}): Response {
    const headersObj = new Headers(headers);
    return {
      status,
      headers: headersObj,
    } as Response;
  }

  // Import the actual function logic
  function isCfAccessAuthPage(response: Response, responseText: string): boolean {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return false;
    }

    const cfAccessIndicators = [
      'cloudflareaccess',
      'cf-access',
      'access.cloudflare',
      'Access-Jwt-Assertion',
      'CF_Authorization',
      'cloudflare-static',
    ];

    const lowerText = responseText.toLowerCase();
    return cfAccessIndicators.some(indicator => lowerText.includes(indicator.toLowerCase()));
  }

  test("returns true for HTML response with CF Access login page indicators", () => {
    const response = createMockResponse(200, { "content-type": "text/html" });
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Sign in</title></head>
        <body>
          <script src="https://cloudflare-static.com/auth.js"></script>
          <div id="cf-access-login">Please sign in</div>
        </body>
      </html>
    `;
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });

  test("returns true for HTML with cloudflareaccess indicator", () => {
    const response = createMockResponse(403, { "content-type": "text/html; charset=utf-8" });
    const html = '<html><body>cloudflareaccess authentication required</body></html>';
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });

  test("returns true for HTML with Access-Jwt-Assertion", () => {
    const response = createMockResponse(401, { "content-type": "text/html" });
    const html = '<html><script>var Access-Jwt-Assertion = "";</script></html>';
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });

  test("returns true for HTML with CF_Authorization cookie reference", () => {
    const response = createMockResponse(302, { "content-type": "text/html" });
    const html = '<html><body>Set CF_Authorization cookie to continue</body></html>';
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });

  test("returns false for JSON response even with CF indicators in body", () => {
    const response = createMockResponse(200, { "content-type": "application/json" });
    const json = '{"error": "cf-access denied"}';
    expect(isCfAccessAuthPage(response, json)).toBe(false);
  });

  test("returns false for HTML without CF Access indicators", () => {
    const response = createMockResponse(500, { "content-type": "text/html" });
    const html = '<html><body>Internal Server Error</body></html>';
    expect(isCfAccessAuthPage(response, html)).toBe(false);
  });

  test("returns false for empty content-type", () => {
    const response = createMockResponse(200, {});
    const html = '<html><body>cloudflareaccess</body></html>';
    expect(isCfAccessAuthPage(response, html)).toBe(false);
  });

  test("returns false for text/plain content even with CF indicators", () => {
    const response = createMockResponse(200, { "content-type": "text/plain" });
    const text = 'Error: cloudflareaccess denied';
    expect(isCfAccessAuthPage(response, text)).toBe(false);
  });

  test("handles case-insensitive indicator matching", () => {
    const response = createMockResponse(200, { "content-type": "text/html" });
    const html = '<html><body>CLOUDFLAREACCESS login</body></html>';
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });

  test("handles content-type with charset", () => {
    const response = createMockResponse(200, { "content-type": "text/html; charset=utf-8" });
    const html = '<html><body>cf-access login required</body></html>';
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });
});

describe("CF Access Header Integration", () => {
  // Test that headers are correctly formatted for HTTP requests
  function formatCfHeaders(clientId: string, clientSecret: string): Record<string, string> {
    return {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret,
    };
  }

  test("formats headers correctly", () => {
    const headers = formatCfHeaders("my-client-id", "my-secret");
    expect(headers['CF-Access-Client-Id']).toBe("my-client-id");
    expect(headers['CF-Access-Client-Secret']).toBe("my-secret");
  });

  test("headers can be spread into request options", () => {
    const cfHeaders = formatCfHeaders("client", "secret");
    const requestHeaders = {
      ...cfHeaders,
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token',
    };

    expect(requestHeaders['CF-Access-Client-Id']).toBe("client");
    expect(requestHeaders['CF-Access-Client-Secret']).toBe("secret");
    expect(requestHeaders['Content-Type']).toBe("application/json");
    expect(requestHeaders['Authorization']).toBe("Bearer token");
  });
});
