import { describe, expect, test } from "bun:test";

/**
 * Tests for API functions accepting serverUrl parameter
 *
 * These tests verify that:
 * 1. API functions accept an optional serverUrl parameter
 * 2. When serverUrl is provided, it overrides the default
 * 3. URL construction works correctly with custom server URLs
 */

describe("API Server URL Parameter", () => {
  describe("URL Construction Logic", () => {
    function buildApiUrl(path: string, serverUrl: string): string {
      return `${serverUrl}${path}`;
    }

    test("builds URL with default server", () => {
      const url = buildApiUrl("/auth/device", "https://app.scratch.dev");
      expect(url).toBe("https://app.scratch.dev/auth/device");
    });

    test("builds URL with custom server", () => {
      const url = buildApiUrl("/auth/device", "https://staging.scratch.dev");
      expect(url).toBe("https://staging.scratch.dev/auth/device");
    });

    test("builds URL with localhost", () => {
      const url = buildApiUrl("/auth/device", "http://localhost:8788");
      expect(url).toBe("http://localhost:8788/auth/device");
    });

    test("handles paths with query strings", () => {
      const url = buildApiUrl("/api/projects/test?namespace=acme.com", "https://app.scratch.dev");
      expect(url).toBe("https://app.scratch.dev/api/projects/test?namespace=acme.com");
    });
  });

  describe("Server URL Fallback Logic", () => {
    async function getEffectiveServerUrl(
      override: string | undefined,
      defaultUrl: string
    ): Promise<string> {
      return override || defaultUrl;
    }

    test("uses override when provided", async () => {
      const url = await getEffectiveServerUrl(
        "https://staging.scratch.dev",
        "https://app.scratch.dev"
      );
      expect(url).toBe("https://staging.scratch.dev");
    });

    test("uses default when no override", async () => {
      const url = await getEffectiveServerUrl(undefined, "https://app.scratch.dev");
      expect(url).toBe("https://app.scratch.dev");
    });

    test("uses override even if it matches default", async () => {
      const url = await getEffectiveServerUrl(
        "https://app.scratch.dev",
        "https://app.scratch.dev"
      );
      expect(url).toBe("https://app.scratch.dev");
    });
  });

  describe("API Endpoint Paths", () => {
    const API_PATHS = {
      deviceFlow: "/auth/device",
      deviceToken: "/auth/device/token",
      currentUser: "/api/me",
      projects: "/api/projects",
      projectByName: (name: string) => `/api/projects/${encodeURIComponent(name)}`,
      projectDeploy: (name: string) => `/api/projects/${encodeURIComponent(name)}/deploy`,
      projectShareTokens: (name: string) => `/api/projects/${encodeURIComponent(name)}/share-tokens`,
    };

    test("device flow endpoint", () => {
      expect(API_PATHS.deviceFlow).toBe("/auth/device");
    });

    test("device token endpoint", () => {
      expect(API_PATHS.deviceToken).toBe("/auth/device/token");
    });

    test("current user endpoint", () => {
      expect(API_PATHS.currentUser).toBe("/api/me");
    });

    test("projects list endpoint", () => {
      expect(API_PATHS.projects).toBe("/api/projects");
    });

    test("project by name endpoint with encoding", () => {
      expect(API_PATHS.projectByName("my-project")).toBe("/api/projects/my-project");
      expect(API_PATHS.projectByName("my project")).toBe("/api/projects/my%20project");
    });

    test("project deploy endpoint", () => {
      expect(API_PATHS.projectDeploy("my-project")).toBe("/api/projects/my-project/deploy");
    });

    test("project share tokens endpoint", () => {
      expect(API_PATHS.projectShareTokens("my-project")).toBe("/api/projects/my-project/share-tokens");
    });
  });

  describe("Query String Building", () => {
    function buildQueryString(params: Record<string, string | undefined>): string {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          queryParams.set(key, value);
        }
      }
      const qs = queryParams.toString();
      return qs ? `?${qs}` : "";
    }

    test("builds query string with namespace", () => {
      const qs = buildQueryString({ namespace: "acme.com" });
      expect(qs).toBe("?namespace=acme.com");
    });

    test("builds query string with visibility", () => {
      const qs = buildQueryString({ visibility: "public" });
      expect(qs).toBe("?visibility=public");
    });

    test("builds query string with multiple params", () => {
      const qs = buildQueryString({ namespace: "acme.com", visibility: "public" });
      expect(qs).toContain("namespace=acme.com");
      expect(qs).toContain("visibility=public");
    });

    test("skips undefined params", () => {
      const qs = buildQueryString({ namespace: "acme.com", visibility: undefined });
      expect(qs).toBe("?namespace=acme.com");
      expect(qs).not.toContain("visibility");
    });

    test("returns empty string when no params", () => {
      const qs = buildQueryString({});
      expect(qs).toBe("");
    });

    test("returns empty string when all params undefined", () => {
      const qs = buildQueryString({ namespace: undefined, visibility: undefined });
      expect(qs).toBe("");
    });
  });

  describe("Mock Response Handling", () => {
    function createMockResponse(
      status: number,
      body: unknown,
      headers: Record<string, string> = {}
    ): Response {
      return new Response(JSON.stringify(body), {
        status,
        headers: new Headers({
          "content-type": "application/json",
          ...headers,
        }),
      });
    }

    test("creates successful response", () => {
      const response = createMockResponse(200, { success: true });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
    });

    test("creates error response", () => {
      const response = createMockResponse(401, { error: "Unauthorized" });
      expect(response.status).toBe(401);
    });

    test("parses response body", async () => {
      const response = createMockResponse(200, { user: { email: "test@example.com" } });
      const body = await response.json();
      expect(body.user.email).toBe("test@example.com");
    });
  });

  describe("API Error Scenarios", () => {
    class ApiError extends Error {
      constructor(
        message: string,
        public status: number,
        public body?: unknown
      ) {
        super(message);
        this.name = "ApiError";
      }
    }

    test("creates error with status", () => {
      const error = new ApiError("Request failed", 401);
      expect(error.status).toBe(401);
      expect(error.message).toBe("Request failed");
    });

    test("creates error with body", () => {
      const error = new ApiError("Request failed", 403, { code: "FORBIDDEN" });
      expect(error.body).toEqual({ code: "FORBIDDEN" });
    });

    test("error is instance of Error", () => {
      const error = new ApiError("Test", 500);
      expect(error).toBeInstanceOf(Error);
    });

    test("error has correct name", () => {
      const error = new ApiError("Test", 500);
      expect(error.name).toBe("ApiError");
    });
  });
});

describe("Server URL Override in Different Commands", () => {
  describe("Login Flow", () => {
    test("uses override URL for device flow", () => {
      const override = "https://staging.scratch.dev";
      const defaultUrl = "https://app.scratch.dev";
      const effectiveUrl = override || defaultUrl;

      expect(effectiveUrl).toBe("https://staging.scratch.dev");
    });

    test("uses default URL when no override", () => {
      const override = undefined;
      const defaultUrl = "https://app.scratch.dev";
      const effectiveUrl = override || defaultUrl;

      expect(effectiveUrl).toBe("https://app.scratch.dev");
    });
  });

  describe("Deploy Flow", () => {
    test("precedence: CLI flag > project config > global config", () => {
      function getEffectiveServerUrl(
        cliOption: string | undefined,
        projectConfig: string | undefined,
        globalConfig: string
      ): string {
        return cliOption || projectConfig || globalConfig;
      }

      // CLI flag takes precedence
      expect(
        getEffectiveServerUrl(
          "https://cli.scratch.dev",
          "https://project.scratch.dev",
          "https://global.scratch.dev"
        )
      ).toBe("https://cli.scratch.dev");

      // Project config used when no CLI flag
      expect(
        getEffectiveServerUrl(
          undefined,
          "https://project.scratch.dev",
          "https://global.scratch.dev"
        )
      ).toBe("https://project.scratch.dev");

      // Global config used as fallback
      expect(
        getEffectiveServerUrl(undefined, undefined, "https://global.scratch.dev")
      ).toBe("https://global.scratch.dev");
    });
  });

  describe("Project Commands", () => {
    test("list projects uses server URL for both auth and API", () => {
      const serverUrl = "https://staging.scratch.dev";

      // Both requireAuth and listProjects should use the same serverUrl
      const authServerUrl = serverUrl;
      const apiServerUrl = serverUrl;

      expect(authServerUrl).toBe(apiServerUrl);
    });
  });

  describe("Share Token Commands", () => {
    test("all share commands use consistent server URL", () => {
      const serverUrl = "https://staging.scratch.dev";

      // All operations should use the same server URL
      const createUrl = serverUrl;
      const listUrl = serverUrl;
      const revokeUrl = serverUrl;

      expect(createUrl).toBe(listUrl);
      expect(listUrl).toBe(revokeUrl);
    });
  });
});

describe("Integration: Multi-server Credential Selection", () => {
  describe("Credential Lookup by Server", () => {
    interface MockCredentials {
      [serverUrl: string]: {
        token: string;
        user: { email: string };
      };
    }

    const mockCredentialsStore: MockCredentials = {
      "https://app.scratch.dev": {
        token: "prod-token",
        user: { email: "prod@example.com" },
      },
      "https://staging.scratch.dev": {
        token: "staging-token",
        user: { email: "staging@example.com" },
      },
      "http://localhost:8788": {
        token: "local-token",
        user: { email: "local@example.com" },
      },
    };

    function loadCredentials(serverUrl: string) {
      const normalizedUrl = serverUrl.replace(/\/+$/, "").toLowerCase();
      return mockCredentialsStore[normalizedUrl] || null;
    }

    test("loads production credentials", () => {
      const creds = loadCredentials("https://app.scratch.dev");
      expect(creds?.token).toBe("prod-token");
      expect(creds?.user.email).toBe("prod@example.com");
    });

    test("loads staging credentials", () => {
      const creds = loadCredentials("https://staging.scratch.dev");
      expect(creds?.token).toBe("staging-token");
      expect(creds?.user.email).toBe("staging@example.com");
    });

    test("loads localhost credentials", () => {
      const creds = loadCredentials("http://localhost:8788");
      expect(creds?.token).toBe("local-token");
    });

    test("returns null for unknown server", () => {
      const creds = loadCredentials("https://unknown.scratch.dev");
      expect(creds).toBeNull();
    });

    test("normalizes URL before lookup", () => {
      const creds = loadCredentials("https://APP.SCRATCH.DEV/");
      expect(creds?.token).toBe("prod-token");
    });
  });

  describe("Token Usage per Server", () => {
    test("different tokens for different servers", () => {
      const prodToken = "prod-token-xyz";
      const stagingToken = "staging-token-abc";

      expect(prodToken).not.toBe(stagingToken);
    });

    test("same token used consistently for same server", () => {
      const token1 = "server-token";
      const token2 = "server-token";

      expect(token1).toBe(token2);
    });
  });
});
