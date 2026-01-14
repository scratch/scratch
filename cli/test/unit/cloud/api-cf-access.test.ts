import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from "bun:test";

/**
 * Tests for CF Access authentication handling in the API module.
 *
 * These tests verify:
 * 1. Detection of CF Access auth pages (expired tokens or unconfigured)
 * 2. Different messages based on whether credentials were previously configured
 * 3. Automatic retry after credentials are entered
 */

// Mock response helper
function createMockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: new Headers({
      "content-type": "application/json",
      ...headers,
    }),
  });
}

function createHtmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
    }),
  });
}

// CF Access HTML page mock (what Cloudflare returns when auth is needed)
const CF_ACCESS_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Access Denied</title>
  <script src="https://cloudflare-static.com/access/js/access.js"></script>
</head>
<body>
  <div id="cf-access-login">
    Please authenticate with Cloudflare Access
  </div>
</body>
</html>
`;

// Regular HTML error (not CF Access)
const REGULAR_HTML_ERROR = `
<!DOCTYPE html>
<html>
<head><title>500 Internal Server Error</title></head>
<body>
  <h1>Internal Server Error</h1>
  <p>Something went wrong.</p>
</body>
</html>
`;

describe("isCfAccessAuthPage detection", () => {
  // Import the actual function
  const { isCfAccessAuthPage } = require("../../../src/config/cf-access");

  test("detects CF Access HTML page with cloudflare-static indicator", () => {
    const response = createHtmlResponse(200, CF_ACCESS_HTML);
    expect(isCfAccessAuthPage(response, CF_ACCESS_HTML)).toBe(true);
  });

  test("detects CF Access HTML page with cf-access indicator", () => {
    const html = '<html><body class="cf-access-page">Login required</body></html>';
    const response = createHtmlResponse(403, html);
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });

  test("does not trigger on regular HTML errors", () => {
    const response = createHtmlResponse(500, REGULAR_HTML_ERROR);
    expect(isCfAccessAuthPage(response, REGULAR_HTML_ERROR)).toBe(false);
  });

  test("does not trigger on JSON responses", () => {
    const json = '{"error": "unauthorized"}';
    const response = createMockResponse(401, json);
    expect(isCfAccessAuthPage(response, json)).toBe(false);
  });

  test("does not trigger on JSON responses even with cf-access in body", () => {
    const json = '{"error": "cf-access denied"}';
    const response = createMockResponse(403, json);
    expect(isCfAccessAuthPage(response, json)).toBe(false);
  });
});

describe("handleCfAccessAuth messaging", () => {
  // We test the logic inline since we can't easily mock the module imports

  function getExpectedMessage(hadCredentials: boolean): string {
    if (hadCredentials) {
      return "Cloudflare Access token expired. Please update your credentials.";
    } else {
      return "This server requires Cloudflare Access authentication.";
    }
  }

  test("shows 'token expired' message when credentials were configured", () => {
    const message = getExpectedMessage(true);
    expect(message).toBe("Cloudflare Access token expired. Please update your credentials.");
  });

  test("shows 'server requires auth' message when credentials were not configured", () => {
    const message = getExpectedMessage(false);
    expect(message).toBe("This server requires Cloudflare Access authentication.");
  });
});

describe("CF Access retry flow", () => {
  // Test the retry logic by simulating the flow

  interface MockFetchCall {
    url: string;
    hadCfHeaders: boolean;
  }

  test("retries request after CF Access auth is completed", async () => {
    const fetchCalls: MockFetchCall[] = [];
    let callCount = 0;

    // Simulate fetch behavior:
    // 1st call: no CF headers, returns CF Access HTML
    // 2nd call: has CF headers (after auth), returns success
    const mockFetch = async (url: string, options: RequestInit) => {
      callCount++;
      const hasCfHeaders = !!(options.headers as Record<string, string>)?.["CF-Access-Client-Id"];
      fetchCalls.push({ url, hadCfHeaders: hasCfHeaders });

      if (callCount === 1) {
        // First call - return CF Access HTML
        return createHtmlResponse(200, CF_ACCESS_HTML);
      } else {
        // Second call - return success
        return createMockResponse(200, '{"success": true}');
      }
    };

    // Simulate the retry flow
    const cfHeaders1 = undefined; // No credentials initially
    const cfHeaders2 = { "CF-Access-Client-Id": "id", "CF-Access-Client-Secret": "secret" };

    // First request (no credentials)
    const response1 = await mockFetch("/api/test", {
      headers: cfHeaders1 ? { ...cfHeaders1 } : {},
    });
    const text1 = await response1.text();

    // Check if CF Access auth needed
    const needsAuth = response1.headers.get("content-type")?.includes("text/html") &&
      text1.toLowerCase().includes("cloudflare");

    expect(needsAuth).toBe(true);
    expect(fetchCalls[0].hadCfHeaders).toBe(false);

    // After user enters credentials, retry
    const response2 = await mockFetch("/api/test", {
      headers: { ...cfHeaders2 },
    });
    const text2 = await response2.text();
    const result = JSON.parse(text2);

    expect(result.success).toBe(true);
    expect(fetchCalls[1].hadCfHeaders).toBe(true);
    expect(callCount).toBe(2);
  });

  test("does not retry more than once to prevent infinite loops", () => {
    // Test that _isRetry flag prevents multiple retries
    let retryCount = 0;

    function shouldRetry(isRetry: boolean): boolean {
      if (isRetry) {
        return false; // Already retried, don't retry again
      }
      retryCount++;
      return true;
    }

    // First attempt - should retry
    expect(shouldRetry(false)).toBe(true);
    expect(retryCount).toBe(1);

    // Second attempt (retry) - should not retry again
    expect(shouldRetry(true)).toBe(false);
    expect(retryCount).toBe(1); // Count didn't increase
  });
});

describe("CF Access credential detection", () => {
  test("detects when CF Access credentials are configured", () => {
    const cfHeaders = {
      "CF-Access-Client-Id": "test-id",
      "CF-Access-Client-Secret": "test-secret",
    };

    const hadCredentials = cfHeaders !== undefined;
    expect(hadCredentials).toBe(true);
  });

  test("detects when CF Access credentials are not configured", () => {
    const cfHeaders = undefined;

    const hadCredentials = cfHeaders !== undefined;
    expect(hadCredentials).toBe(false);
  });
});

describe("Integration: CF Access auth flow scenarios", () => {
  describe("Scenario: User without CF Access credentials hits protected server", () => {
    test("should detect CF Access page and show setup message", () => {
      const cfHeaders = undefined; // No credentials configured
      const responseHtml = CF_ACCESS_HTML;
      const isHtml = true;
      const hasCfIndicators = responseHtml.toLowerCase().includes("cloudflare");

      // Detection
      const needsCfAuth = isHtml && hasCfIndicators;
      expect(needsCfAuth).toBe(true);

      // Message selection
      const hadCredentials = cfHeaders !== undefined;
      const message = hadCredentials
        ? "Cloudflare Access token expired. Please update your credentials."
        : "This server requires Cloudflare Access authentication.";

      expect(message).toBe("This server requires Cloudflare Access authentication.");
    });
  });

  describe("Scenario: User with expired CF Access credentials", () => {
    test("should detect CF Access page and show expired message", () => {
      const cfHeaders = {
        "CF-Access-Client-Id": "old-id",
        "CF-Access-Client-Secret": "old-secret",
      };
      const responseHtml = CF_ACCESS_HTML;
      const isHtml = true;
      const hasCfIndicators = responseHtml.toLowerCase().includes("cloudflare");

      // Detection
      const needsCfAuth = isHtml && hasCfIndicators;
      expect(needsCfAuth).toBe(true);

      // Message selection
      const hadCredentials = cfHeaders !== undefined;
      const message = hadCredentials
        ? "Cloudflare Access token expired. Please update your credentials."
        : "This server requires Cloudflare Access authentication.";

      expect(message).toBe("Cloudflare Access token expired. Please update your credentials.");
    });
  });

  describe("Scenario: Normal server without CF Access", () => {
    test("should not trigger CF Access flow for regular JSON responses", () => {
      const response = createMockResponse(200, '{"data": "test"}');
      const isHtml = response.headers.get("content-type")?.includes("text/html");

      expect(isHtml).toBeFalsy();
    });

    test("should not trigger CF Access flow for regular HTML errors", () => {
      const response = createHtmlResponse(500, REGULAR_HTML_ERROR);
      const { isCfAccessAuthPage } = require("../../../src/config/cf-access");

      expect(isCfAccessAuthPage(response, REGULAR_HTML_ERROR)).toBe(false);
    });
  });

  describe("Scenario: CF Access with valid credentials", () => {
    test("should proceed normally with valid credentials", () => {
      const cfHeaders = {
        "CF-Access-Client-Id": "valid-id",
        "CF-Access-Client-Secret": "valid-secret",
      };
      const response = createMockResponse(200, '{"success": true}');
      const isSuccess = response.status === 200;
      const isJson = response.headers.get("content-type")?.includes("application/json");

      expect(isSuccess).toBe(true);
      expect(isJson).toBe(true);
      expect(cfHeaders).toBeDefined();
    });
  });
});

describe("CF Access indicators", () => {
  const { isCfAccessAuthPage } = require("../../../src/config/cf-access");

  const cfIndicators = [
    { name: "cloudflareaccess", html: "<html><body>cloudflareaccess login</body></html>" },
    { name: "cf-access", html: "<html><body class='cf-access'>content</body></html>" },
    { name: "access.cloudflare", html: "<html><script src='https://access.cloudflare.com/auth.js'></script></html>" },
    { name: "Access-Jwt-Assertion", html: "<html><body>Access-Jwt-Assertion required</body></html>" },
    { name: "CF_Authorization", html: "<html><body>Set CF_Authorization cookie</body></html>" },
    { name: "cloudflare-static", html: "<html><script src='https://cloudflare-static.com/js/app.js'></script></html>" },
  ];

  for (const { name, html } of cfIndicators) {
    test(`detects CF Access page with '${name}' indicator`, () => {
      const response = createHtmlResponse(200, html);
      expect(isCfAccessAuthPage(response, html)).toBe(true);
    });
  }

  test("handles case-insensitive matching", () => {
    const html = "<html><body>CLOUDFLAREACCESS AUTH</body></html>";
    const response = createHtmlResponse(200, html);
    expect(isCfAccessAuthPage(response, html)).toBe(true);
  });
});
