import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("clean command", () => {
  test("removes dist/ and .scratch-build-cache/ directories", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("clean-");
    runCliSync(["init", "sandbox", "--full"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Build the project to create dist/ and .scratch-build-cache/
    runCliSync(["build", "sandbox"], tempDir);

    // 3. Verify both directories exist after build
    const distDir = path.join(sandboxDir, "dist");
    const cacheDir = path.join(sandboxDir, ".scratch-build-cache");

    expect(await fs.exists(distDir)).toBe(true);
    expect(await fs.exists(cacheDir)).toBe(true);

    // 4. Run clean command
    runCliSync(["clean", "sandbox"], tempDir);

    // 5. Verify both directories are removed
    expect(await fs.exists(distDir)).toBe(false);
    expect(await fs.exists(cacheDir)).toBe(false);

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
