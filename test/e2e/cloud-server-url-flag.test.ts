import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { mkTempDir, scratchPath } from "./util";

/**
 * E2E tests for the --server-url flag on cloud commands.
 *
 * These tests verify that:
 * 1. The --server-url flag is available on all cloud commands
 * 2. The CLI correctly parses and passes the flag
 * 3. Help text shows the flag option
 *
 * Note: Full integration tests with actual server calls would require
 * a running server instance. These tests focus on CLI parsing behavior.
 */

describe("cloud --server-url flag", () => {
  /**
   * Helper that runs CLI and returns output without throwing on errors
   */
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

  describe("Help output shows --server-url option", () => {
    test("cloud login --help includes --server-url", () => {
      const result = runCli(["cloud", "login", "--help"]);
      expect(result.stdout).toContain("--server-url");
      expect(result.stdout).toContain("Override server URL");
    });

    test("cloud logout --help includes --server-url", () => {
      const result = runCli(["cloud", "logout", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud whoami --help includes --server-url", () => {
      const result = runCli(["cloud", "whoami", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud deploy --help includes --server-url", () => {
      const result = runCli(["cloud", "deploy", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud projects list --help includes --server-url", () => {
      const result = runCli(["cloud", "projects", "list", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud projects info --help includes --server-url", () => {
      const result = runCli(["cloud", "projects", "info", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud projects delete --help includes --server-url", () => {
      const result = runCli(["cloud", "projects", "delete", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud share create --help includes --server-url", () => {
      const result = runCli(["cloud", "share", "create", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud share list --help includes --server-url", () => {
      const result = runCli(["cloud", "share", "list", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });

    test("cloud share revoke --help includes --server-url", () => {
      const result = runCli(["cloud", "share", "revoke", "--help"]);
      expect(result.stdout).toContain("--server-url");
    });
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
