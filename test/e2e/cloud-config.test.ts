import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { mkTempDir, scratchPath } from "./util";

/**
 * Run CLI with custom HOME directory to isolate config
 */
function runCliWithHome(args: string[], home: string) {
  const result = spawnSync(scratchPath, args, {
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
      HOME: home,
    },
  });

  if (result.status !== 0) {
    const output = (result.stdout || "") + (result.stderr || "");
    throw new Error(`scratch CLI ${args.join(" ")} exited with code ${result.status}\n${output}`);
  }

  return result;
}

describe("cloud config command", () => {
  test("creates config.toml with server URL", async () => {
    // Use temp dir as HOME to isolate config
    const tempHome = await mkTempDir("cloud-config-");
    const configPath = path.join(tempHome, ".scratch", "config.toml");

    // Run config command with --server flag
    runCliWithHome(["cloud", "config", "--server", "example.scratch.dev"], tempHome);

    // Verify config file was created
    expect(await fs.exists(configPath)).toBe(true);

    // Verify content
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('serverUrl = "https://example.scratch.dev"');

    // Cleanup
    await rm(tempHome, { recursive: true, force: true });
  });

  test("normalizes URL without protocol", async () => {
    const tempHome = await mkTempDir("cloud-config-");
    const configPath = path.join(tempHome, ".scratch", "config.toml");

    // Run without https:// prefix
    runCliWithHome(["cloud", "config", "--server", "my-server.com"], tempHome);

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('serverUrl = "https://my-server.com"');

    await rm(tempHome, { recursive: true, force: true });
  });

  test("preserves URL with explicit protocol", async () => {
    const tempHome = await mkTempDir("cloud-config-");
    const configPath = path.join(tempHome, ".scratch", "config.toml");

    // Run with explicit http:// (for local dev)
    runCliWithHome(["cloud", "config", "--server", "http://localhost:3000"], tempHome);

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('serverUrl = "http://localhost:3000"');

    await rm(tempHome, { recursive: true, force: true });
  });

  test("overwrites existing config", async () => {
    const tempHome = await mkTempDir("cloud-config-");
    const configPath = path.join(tempHome, ".scratch", "config.toml");

    // Create initial config
    runCliWithHome(["cloud", "config", "--server", "first.dev"], tempHome);

    // Overwrite with new value
    runCliWithHome(["cloud", "config", "--server", "second.dev"], tempHome);

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('serverUrl = "https://second.dev"');
    expect(content).not.toContain("first.dev");

    await rm(tempHome, { recursive: true, force: true });
  });
});
