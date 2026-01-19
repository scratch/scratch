import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { runCliSync, mkTempDir, scratchPath } from "./util";

/**
 * Run CLI and return stdout/stderr without throwing on non-zero exit
 */
function runCliCapture(args: string[], cwd: string) {
  const result = spawnSync(scratchPath, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("eject command", () => {
  test("lists available template files with --list", async () => {
    const tempDir = await mkTempDir("eject-list-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["eject", "--list"], sandboxDir);

    expect(result.status).toBe(0);
    // Should include common template files (shown in tree format)
    expect(result.stdout).toContain("tailwind.css");
    expect(result.stdout).toContain("index.mdx");
    expect(result.stdout).toContain("src/");
    expect(result.stdout).toContain("pages/");
    // Should NOT include _build/ files
    expect(result.stdout).not.toContain("_build/");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
