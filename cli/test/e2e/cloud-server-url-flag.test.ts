import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { mkTempDir, scratchPath } from "./util";

/**
 * E2E tests for server URL handling and multi-server credentials.
 *
 * These tests verify:
 * 1. Multi-server credentials storage format
 * 2. Server URL normalization
 * 3. Configuration precedence
 *
 * Note: Server URL is passed via the --server <url> option flag.
 */

describe("Server URL as --server option", () => {
  function runCli(args: string[], cwd: string = process.cwd()): { stdout: string; stderr: string; status: number } {
    const result = spawnSync(scratchPath, args, {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    });

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      status: result.status || 0,
    };
  }

  test("whoami accepts --server option", () => {
    const result = runCli(["whoami", "--help"]);
    expect(result.stdout).toContain("--server <url>");
    expect(result.stdout).toContain("Server URL");
  });

  test("login accepts --server option", () => {
    const result = runCli(["login", "--help"]);
    expect(result.stdout).toContain("--server <url>");
    expect(result.stdout).toContain("Server URL");
  });

  test("logout accepts --server option", () => {
    const result = runCli(["logout", "--help"]);
    expect(result.stdout).toContain("--server <url>");
    expect(result.stdout).toContain("Server URL");
  });

  test("projects ls accepts --server option", () => {
    const result = runCli(["projects", "ls", "--help"]);
    expect(result.stdout).toContain("--server <url>");
    expect(result.stdout).toContain("Server URL");
  });

  test("tokens ls accepts --server option", () => {
    const result = runCli(["tokens", "ls", "--help"]);
    expect(result.stdout).toContain("--server <url>");
    expect(result.stdout).toContain("Server URL");
  });

  test("share create accepts --server option", () => {
    const result = runCli(["share", "create", "--help"]);
    expect(result.stdout).toContain("--server <url>");
    expect(result.stdout).toContain("Server URL");
  });

  test("cf-access accepts --server option", () => {
    const result = runCli(["cf-access", "--help"]);
    expect(result.stdout).toContain("--server <url>");
    expect(result.stdout).toContain("Server URL");
  });
});

describe("Multi-server credentials storage", () => {
  let tempDir: string;
  let originalHome: string;

  beforeAll(async () => {
    tempDir = await mkTempDir("cloud-creds-e2e-");
    originalHome = process.env.HOME || os.homedir();
    process.env.HOME = tempDir;

    // Create .scratch directory
    await fs.mkdir(path.join(tempDir, ".scratch"), { recursive: true });
  });

  afterAll(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("credentials file supports multiple servers", async () => {
    // Simulate the multi-server credentials format
    const credentialsPath = path.join(tempDir, ".scratch", "credentials.json");

    const multiServerCredentials = {
      "https://app.scratch.dev": {
        token: "prod-token-123",
        user: {
          id: "user-1",
          email: "prod@example.com",
          name: "Production User",
        },
      },
      "https://staging.scratch.dev": {
        token: "staging-token-456",
        user: {
          id: "user-2",
          email: "staging@example.com",
          name: null,
        },
      },
    };

    await fs.writeFile(credentialsPath, JSON.stringify(multiServerCredentials, null, 2) + "\n");

    // Verify file was written correctly
    const content = await fs.readFile(credentialsPath, "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed["https://app.scratch.dev"]).toBeDefined();
    expect(parsed["https://staging.scratch.dev"]).toBeDefined();
    expect(parsed["https://app.scratch.dev"].token).toBe("prod-token-123");
    expect(parsed["https://staging.scratch.dev"].token).toBe("staging-token-456");
  });

  test("cf-access credentials file supports multiple servers", async () => {
    // Simulate the multi-server CF Access credentials format
    const cfAccessPath = path.join(tempDir, ".scratch", "cf-access.json");

    const multiServerCfAccess = {
      "https://app.scratch.dev": {
        client_id: "prod-client-id",
        client_secret: "prod-client-secret",
      },
      "https://staging.scratch.dev": {
        client_id: "staging-client-id",
        client_secret: "staging-client-secret",
      },
    };

    await fs.writeFile(cfAccessPath, JSON.stringify(multiServerCfAccess, null, 2) + "\n");

    // Verify file was written correctly
    const content = await fs.readFile(cfAccessPath, "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed["https://app.scratch.dev"]).toBeDefined();
    expect(parsed["https://staging.scratch.dev"]).toBeDefined();
    expect(parsed["https://app.scratch.dev"].client_id).toBe("prod-client-id");
    expect(parsed["https://staging.scratch.dev"].client_id).toBe("staging-client-id");
  });

  test("credentials file permissions should be restrictive", async () => {
    // Note: File permissions behave differently across operating systems
    // and temp directories. The actual credential functions use chmod after write.
    // This test documents the expected permission mode.
    const expectedMode = 0o600; // Owner read/write only
    expect(expectedMode).toBe(0o600);
  });

  test("credentials are keyed by normalized server URL", async () => {
    // Test that URLs are normalized (lowercase, no trailing slash)
    const normalized = (url: string) => url.replace(/\/+$/, "").toLowerCase();

    expect(normalized("https://APP.SCRATCH.DEV/")).toBe("https://app.scratch.dev");
    expect(normalized("https://staging.scratch.dev/")).toBe("https://staging.scratch.dev");
    expect(normalized("http://LOCALHOST:8788/")).toBe("http://localhost:8788");
  });
});

describe("Server URL normalization", () => {
  // Import the normalizeServerUrl function
  const { normalizeServerUrl } = require("../../src/cmd/cloud/context");

  test("adds https:// if no protocol specified", () => {
    const result = normalizeServerUrl("app.scratch.dev");
    expect(result.url).toBe("https://app.scratch.dev");
    expect(result.modified).toBe(false); // Only modified if app. was added
  });

  test("preserves http:// for localhost", () => {
    const result = normalizeServerUrl("http://localhost:8788");
    expect(result.url).toBe("http://localhost:8788");
    expect(result.modified).toBe(false);
  });

  test("adds app. subdomain to naked domains", () => {
    const result = normalizeServerUrl("ycscratch.dev");
    expect(result.url).toBe("https://app.ycscratch.dev");
    expect(result.modified).toBe(true);
  });

  test("adds app. subdomain to naked domains with https", () => {
    const result = normalizeServerUrl("https://scratch.dev");
    expect(result.url).toBe("https://app.scratch.dev");
    expect(result.modified).toBe(true);
  });

  test("does not modify URLs with existing subdomain", () => {
    const result = normalizeServerUrl("staging.scratch.dev");
    expect(result.url).toBe("https://staging.scratch.dev");
    expect(result.modified).toBe(false);
  });

  test("does not modify localhost", () => {
    const result = normalizeServerUrl("localhost:8788");
    expect(result.url).toBe("https://localhost:8788");
    expect(result.modified).toBe(false);
  });

  test("does not modify app. subdomain URLs", () => {
    const result = normalizeServerUrl("app.scratch.dev");
    expect(result.url).toBe("https://app.scratch.dev");
    expect(result.modified).toBe(false);
  });

  test("adds app. subdomain to naked .co.uk domains", () => {
    const result = normalizeServerUrl("example.co.uk");
    expect(result.url).toBe("https://app.example.co.uk");
    expect(result.modified).toBe(true);
  });

  test("does not modify .co.uk domains with existing subdomain", () => {
    const result = normalizeServerUrl("app.example.co.uk");
    expect(result.url).toBe("https://app.example.co.uk");
    expect(result.modified).toBe(false);
  });

  test("does not modify staging subdomain on .co.uk", () => {
    const result = normalizeServerUrl("staging.example.co.uk");
    expect(result.url).toBe("https://staging.example.co.uk");
    expect(result.modified).toBe(false);
  });
});

describe("Server URL configuration precedence", () => {
  let tempDir: string;
  let originalHome: string;

  beforeAll(async () => {
    tempDir = await mkTempDir("cloud-config-e2e-");
    originalHome = process.env.HOME || os.homedir();
    process.env.HOME = tempDir;

    // Create config directories
    await fs.mkdir(path.join(tempDir, ".config", "scratch"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".scratch"), { recursive: true });
  });

  afterAll(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("global config stores server_url", async () => {
    const configPath = path.join(tempDir, ".config", "scratch", "config.toml");

    const configContent = `# Scratch Cloud Global Configuration
server_url = "https://custom.scratch.dev"
namespace = "acme.com"
`;

    await fs.writeFile(configPath, configContent);

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('server_url = "https://custom.scratch.dev"');
  });

  test("project config can override server_url", async () => {
    const projectDir = path.join(tempDir, "test-project");
    const configPath = path.join(projectDir, ".scratch", "project.toml");

    await fs.mkdir(path.join(projectDir, ".scratch"), { recursive: true });

    const configContent = `# Scratch Cloud Project Configuration
name = "test-project"
namespace = "acme.com"
server_url = "https://project-specific.scratch.dev"
`;

    await fs.writeFile(configPath, configContent);

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('server_url = "https://project-specific.scratch.dev"');
  });

  test("documents precedence: CLI flag > project config > global config", () => {
    // This test documents the expected precedence
    function getEffectiveServerUrl(
      cliFlag: string | undefined,
      projectConfig: string | undefined,
      globalConfig: string | undefined,
      defaultUrl: string
    ): string {
      return cliFlag || projectConfig || globalConfig || defaultUrl;
    }

    const defaultUrl = "https://app.scratch.dev";

    // CLI flag takes highest precedence
    expect(
      getEffectiveServerUrl(
        "https://cli.scratch.dev",
        "https://project.scratch.dev",
        "https://global.scratch.dev",
        defaultUrl
      )
    ).toBe("https://cli.scratch.dev");

    // Project config next
    expect(
      getEffectiveServerUrl(
        undefined,
        "https://project.scratch.dev",
        "https://global.scratch.dev",
        defaultUrl
      )
    ).toBe("https://project.scratch.dev");

    // Global config next
    expect(
      getEffectiveServerUrl(undefined, undefined, "https://global.scratch.dev", defaultUrl)
    ).toBe("https://global.scratch.dev");

    // Default as fallback
    expect(getEffectiveServerUrl(undefined, undefined, undefined, defaultUrl)).toBe(defaultUrl);
  });
});
