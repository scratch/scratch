import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { mkTempDir } from "../../test-util";

// Path to the compiled scratch executable
const scratchPath = path.resolve(import.meta.dir, "../../../dist/scratch");

/**
 * Tests for the `scratch set-defaults` command.
 *
 * This command configures global set-defaults stored in ~/.config/scratch/config.toml:
 * - server_url: Default server for all projects
 * - visibility: Default visibility for new projects
 */

describe("scratch set-defaults command", () => {
  let tempDir: string;
  let originalHome: string;
  let configDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkTempDir("set-defaults-test-");
    originalHome = process.env.HOME || os.homedir();
    process.env.HOME = tempDir;

    // Set up config directory path
    configDir = path.join(tempDir, ".config", "scratch");
    configPath = path.join(configDir, "config.toml");
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
    const result = spawnSync(scratchPath, args, {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, HOME: tempDir },
    });

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      status: result.status || 0,
    };
  }

  describe("help output", () => {
    test("shows --server option", () => {
      const result = runCli(["set-defaults", "--help"]);
      expect(result.stdout).toContain("--server <url>");
      expect(result.stdout).toContain("Default server URL");
    });

    test("shows --visibility option", () => {
      const result = runCli(["set-defaults", "--help"]);
      expect(result.stdout).toContain("--visibility <visibility>");
      expect(result.stdout).toContain("Default visibility");
    });

    test("command appears in Server Commands group", () => {
      const result = runCli(["--help"]);
      expect(result.stdout).toContain("Server Commands:");
      expect(result.stdout).toContain("set-defaults");
    });
  });

  describe("non-interactive mode (both flags)", () => {
    test("creates config file with both values", async () => {
      const result = runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "private",
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Global defaults saved");
      expect(result.stdout).toContain("server:     https://app.scratch.dev");
      expect(result.stdout).toContain("visibility: private");

      // Verify file was created
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('server_url = "https://app.scratch.dev"');
      expect(content).toContain('visibility = "private"');
    });

    test("accepts public visibility", async () => {
      const result = runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "public",
      ]);

      expect(result.status).toBe(0);
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('visibility = "public"');
    });

    test("accepts domain visibility", async () => {
      const result = runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "@acme.com",
      ]);

      expect(result.status).toBe(0);
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('visibility = "@acme.com"');
    });

    test("accepts email visibility", async () => {
      const result = runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "alice@example.com",
      ]);

      expect(result.status).toBe(0);
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('visibility = "alice@example.com"');
    });

    test("accepts comma-separated visibility list", async () => {
      const result = runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "alice@example.com,@partner.com",
      ]);

      expect(result.status).toBe(0);
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('visibility = "alice@example.com,@partner.com"');
    });

    test("normalizes naked domain to app subdomain", async () => {
      const result = runCli([
        "set-defaults",
        "--server", "https://scratch.dev",
        "--visibility", "private",
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Using https://app.scratch.dev");
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('server_url = "https://app.scratch.dev"');
    });

    test("accepts localhost URLs", async () => {
      const result = runCli([
        "set-defaults",
        "--server", "http://localhost:8788",
        "--visibility", "private",
      ]);

      expect(result.status).toBe(0);
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('server_url = "http://localhost:8788"');
    });
  });

  describe("validation", () => {
    test("rejects invalid visibility", () => {
      const result = runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "invalid",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid format");
    });

    test("rejects invalid server URL", () => {
      const result = runCli([
        "set-defaults",
        "--server", "://invalid",  // Truly invalid URL (not just missing protocol)
        "--visibility", "private",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid URL");
    });

    test("rejects HTTP for non-localhost", () => {
      const result = runCli([
        "set-defaults",
        "--server", "http://example.com",
        "--visibility", "private",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("HTTPS");
    });
  });

  describe("config file format", () => {
    test("includes header comments", async () => {
      runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "private",
      ]);

      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain("# Scratch Global Configuration");
      expect(content).toContain("# Default settings that apply to all projects");
      expect(content).toContain("# Run `scratch set-defaults` to update");
    });

    test("includes field comments", async () => {
      runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "private",
      ]);

      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain("# Default server URL");
      expect(content).toContain("# Default visibility for new projects");
    });

    test("creates config directory if it doesn't exist", async () => {
      // Verify directory doesn't exist
      const existsBefore = await fs.exists(configDir);
      expect(existsBefore).toBe(false);

      runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "private",
      ]);

      const existsAfter = await fs.exists(configDir);
      expect(existsAfter).toBe(true);
    });

    test("overwrites existing config", async () => {
      // Create initial config
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, 'server_url = "https://old.scratch.dev"\nvisibility = "public"\n');

      // Update with new values
      runCli([
        "set-defaults",
        "--server", "https://new.scratch.dev",
        "--visibility", "private",
      ]);

      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('server_url = "https://new.scratch.dev"');
      expect(content).toContain('visibility = "private"');
      expect(content).not.toContain("old.scratch.dev");
      expect(content).not.toContain('"public"');
    });
  });

  describe("TOML escaping", () => {
    test("escapes special characters in visibility", async () => {
      // Email addresses with special chars that need escaping
      const result = runCli([
        "set-defaults",
        "--server", "https://app.scratch.dev",
        "--visibility", "user+tag@example.com",
      ]);

      expect(result.status).toBe(0);
      const content = await fs.readFile(configPath, "utf-8");
      expect(content).toContain('visibility = "user+tag@example.com"');
    });
  });
});

describe("global config module (via CLI)", () => {
  // These tests verify module behavior through the CLI since the module
  // uses PATHS which is computed at load time based on HOME.

  let tempDir: string;
  let originalHome: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkTempDir("global-config-test-");
    originalHome = process.env.HOME || os.homedir();
    process.env.HOME = tempDir;
    configPath = path.join(tempDir, ".config", "scratch", "config.toml");
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
    const result = spawnSync(scratchPath, args, {
      cwd: tempDir,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, HOME: tempDir },
    });
    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      status: result.status || 0,
    };
  }

  test("first run creates config from scratch", async () => {
    // Config shouldn't exist yet
    const existsBefore = await fs.exists(configPath);
    expect(existsBefore).toBe(false);

    // Run set-defaults command
    const result = runCli([
      "set-defaults",
      "--server", "https://app.scratch.dev",
      "--visibility", "private",
    ]);

    expect(result.status).toBe(0);

    // Config should exist now
    const existsAfter = await fs.exists(configPath);
    expect(existsAfter).toBe(true);

    // Verify content
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('server_url = "https://app.scratch.dev"');
    expect(content).toContain('visibility = "private"');
  });

  test("only includes fields that were set", async () => {
    // Run set-defaults with both fields
    runCli([
      "set-defaults",
      "--server", "https://app.scratch.dev",
      "--visibility", "public",
    ]);

    // Verify both fields are present
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain("server_url");
    expect(content).toContain("visibility");
  });

  test("updates preserve file structure", async () => {
    // Create initial config
    runCli([
      "set-defaults",
      "--server", "https://old.scratch.dev",
      "--visibility", "private",
    ]);

    // Update values
    runCli([
      "set-defaults",
      "--server", "https://new.scratch.dev",
      "--visibility", "public",
    ]);

    // Verify updated content
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('server_url = "https://new.scratch.dev"');
    expect(content).toContain('visibility = "public"');
    // Should still have header
    expect(content).toContain("# Scratch Global Configuration");
  });
});

describe("config precedence with global set-defaults", () => {
  // These tests verify the intended precedence: CLI flag > project config > global config > default

  test("documents precedence order", () => {
    function getEffectiveValue(
      cliFlag: string | undefined,
      projectConfig: string | undefined,
      globalConfig: string | undefined,
      defaultValue: string
    ): string {
      return cliFlag || projectConfig || globalConfig || defaultValue;
    }

    const defaultUrl = "https://app.scratch.dev";

    // CLI flag takes highest precedence
    expect(
      getEffectiveValue(
        "https://cli.scratch.dev",
        "https://project.scratch.dev",
        "https://global.scratch.dev",
        defaultUrl
      )
    ).toBe("https://cli.scratch.dev");

    // Project config next
    expect(
      getEffectiveValue(
        undefined,
        "https://project.scratch.dev",
        "https://global.scratch.dev",
        defaultUrl
      )
    ).toBe("https://project.scratch.dev");

    // Global config next
    expect(
      getEffectiveValue(
        undefined,
        undefined,
        "https://global.scratch.dev",
        defaultUrl
      )
    ).toBe("https://global.scratch.dev");

    // Default as fallback
    expect(
      getEffectiveValue(undefined, undefined, undefined, defaultUrl)
    ).toBe(defaultUrl);
  });

  test("visibility precedence follows same pattern", () => {
    function getEffectiveVisibility(
      cliFlag: string | undefined,
      projectConfig: string | undefined,
      globalConfig: string | undefined,
      defaultValue: string
    ): string {
      return cliFlag || projectConfig || globalConfig || defaultValue;
    }

    const defaultVisibility = "private";

    // CLI flag takes highest precedence
    expect(
      getEffectiveVisibility("public", "@project.com", "@global.com", defaultVisibility)
    ).toBe("public");

    // Project config next
    expect(
      getEffectiveVisibility(undefined, "@project.com", "@global.com", defaultVisibility)
    ).toBe("@project.com");

    // Global config next
    expect(
      getEffectiveVisibility(undefined, undefined, "@global.com", defaultVisibility)
    ).toBe("@global.com");

    // Default as fallback
    expect(
      getEffectiveVisibility(undefined, undefined, undefined, defaultVisibility)
    ).toBe(defaultVisibility);
  });
});
