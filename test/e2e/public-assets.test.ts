import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile, mkdir } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Public assets", () => {
  test("files in public/ are copied to dist/", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("public-assets-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const publicDir = path.join(sandboxDir, "public");

    // 2. Create additional files in public/
    // Note: scratch.png already exists from template

    await writeFile(
      path.join(publicDir, "robots.txt"),
      `User-agent: *\nAllow: /`
    );

    await mkdir(path.join(publicDir, "assets"), { recursive: true });
    await writeFile(
      path.join(publicDir, "assets", "data.json"),
      `{"key": "value"}`
    );

    // 3. Build the project
    runCliSync(["build", "sandbox"], tempDir);

    const distDir = path.join(sandboxDir, "dist");

    // 4. Verify files are copied to dist/
    // scratch-logo.svg (from template)
    expect(await fs.exists(path.join(distDir, "scratch-logo.svg"))).toBe(true);

    // robots.txt
    expect(await fs.exists(path.join(distDir, "robots.txt"))).toBe(true);
    const robotsTxt = await readFile(path.join(distDir, "robots.txt"), "utf-8");
    expect(robotsTxt).toContain("User-agent: *");

    // assets/data.json (nested directory)
    expect(await fs.exists(path.join(distDir, "assets", "data.json"))).toBe(true);
    const dataJson = await readFile(path.join(distDir, "assets", "data.json"), "utf-8");
    expect(dataJson).toContain('"key": "value"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
