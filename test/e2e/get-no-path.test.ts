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

describe("get command", () => {
  test("exits with error when no path provided", async () => {
    const tempDir = await mkTempDir("get-nopath-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    const result = runCliCapture(["get"], sandboxDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Please provide a file or directory path");

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
