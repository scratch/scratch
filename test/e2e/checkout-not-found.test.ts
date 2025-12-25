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

describe("checkout command", () => {
  test("exits with error for non-existent template", async () => {
    const tempDir = await mkTempDir("checkout-notfound-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["checkout", "nonexistent.txt"], sandboxDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No template found for: nonexistent.txt");
    expect(result.stdout).toContain("project root");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
