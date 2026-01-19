import { describe, expect, test } from "bun:test";
import { rm } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("eject command", () => {
  test("eject _build works even though it's not in --list", async () => {
    const tempDir = await mkTempDir("eject-build-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // Verify _build doesn't exist after create
    const buildDir = path.join(sandboxDir, "_build");
    expect(await fs.exists(buildDir)).toBe(false);

    // Eject _build explicitly
    runCliSync(["eject", "_build"], sandboxDir);

    // Verify _build files were created
    expect(await fs.exists(buildDir)).toBe(true);
    expect(await fs.exists(path.join(buildDir, "entry-client.tsx"))).toBe(true);
    expect(await fs.exists(path.join(buildDir, "entry-server.jsx"))).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  }, 60_000);
});
