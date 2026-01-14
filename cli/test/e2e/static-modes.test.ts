import { describe, expect, test } from "bun:test";
import { readdir, rm, mkdir, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("scratch build --static modes", () => {
  test("--static=assets copies pages/ assets but not build files", async () => {
    const projectDir = await mkTempDir("static-assets-");

    // Create project
    runCliSync(["create", "."], projectDir);

    // Add test files to pages/
    await mkdir(path.join(projectDir, "pages", "images"), { recursive: true });
    await writeFile(path.join(projectDir, "pages", "images", "photo.png"), "fake png");
    await writeFile(path.join(projectDir, "pages", "extra.md"), "# Extra");
    await writeFile(path.join(projectDir, "pages", "Component.tsx"), "export default () => null");

    // Build with default (assets) mode
    runCliSync(["build", "--static=assets"], projectDir);

    const distDir = path.join(projectDir, "dist");
    const distFiles = await readdir(distDir, { recursive: true });

    // Asset should be copied
    expect(distFiles).toContain(path.join("images", "photo.png"));

    // Build files should NOT be copied
    expect(distFiles).not.toContain("extra.md");
    expect(distFiles).not.toContain("Component.tsx");
    expect(distFiles).not.toContain("index.mdx");

    // Compiled HTML should exist
    expect(distFiles).toContain("index.html");

    await rm(projectDir, { recursive: true, force: true });
  }, 120_000);

  test("--static=all copies all pages/ files including build files", async () => {
    const projectDir = await mkTempDir("static-all-");

    // Create project
    runCliSync(["create", "."], projectDir);

    // Add test files to pages/
    await mkdir(path.join(projectDir, "pages", "images"), { recursive: true });
    await writeFile(path.join(projectDir, "pages", "images", "photo.png"), "fake png");
    await writeFile(path.join(projectDir, "pages", "extra.md"), "# Extra");

    // Build with all mode
    runCliSync(["build", "--static=all"], projectDir);

    const distDir = path.join(projectDir, "dist");
    const distFiles = await readdir(distDir, { recursive: true });

    // Asset should be copied
    expect(distFiles).toContain(path.join("images", "photo.png"));

    // Build files SHOULD be copied in 'all' mode
    expect(distFiles).toContain("extra.md");
    expect(distFiles).toContain("index.mdx");

    // Compiled HTML should still exist (takes priority)
    expect(distFiles).toContain("index.html");

    await rm(projectDir, { recursive: true, force: true });
  }, 120_000);

  test("--static=public excludes pages/ from static assets", async () => {
    const projectDir = await mkTempDir("static-public-");

    // Create project
    runCliSync(["create", "."], projectDir);

    // Add test files to pages/
    await mkdir(path.join(projectDir, "pages", "images"), { recursive: true });
    await writeFile(path.join(projectDir, "pages", "images", "photo.png"), "fake png");

    // Build with public mode
    runCliSync(["build", "--static=public"], projectDir);

    const distDir = path.join(projectDir, "dist");
    const distFiles = await readdir(distDir, { recursive: true });

    // Pages assets should NOT be copied
    expect(distFiles).not.toContain("images");
    expect(distFiles).not.toContain(path.join("images", "photo.png"));

    // Public assets should still be copied
    expect(distFiles).toContain("favicon.svg");

    // Compiled HTML should exist
    expect(distFiles).toContain("index.html");

    await rm(projectDir, { recursive: true, force: true });
  }, 120_000);

  test("default mode is assets (no flag needed)", async () => {
    const projectDir = await mkTempDir("static-default-");

    // Create project
    runCliSync(["create", "."], projectDir);

    // Add test files to pages/
    await mkdir(path.join(projectDir, "pages", "images"), { recursive: true });
    await writeFile(path.join(projectDir, "pages", "images", "photo.png"), "fake png");
    await writeFile(path.join(projectDir, "pages", "extra.md"), "# Extra");

    // Build with no --static flag (should default to assets)
    runCliSync(["build"], projectDir);

    const distDir = path.join(projectDir, "dist");
    const distFiles = await readdir(distDir, { recursive: true });

    // Asset should be copied (same as --static=assets)
    expect(distFiles).toContain(path.join("images", "photo.png"));

    // Build files should NOT be copied
    expect(distFiles).not.toContain("extra.md");

    await rm(projectDir, { recursive: true, force: true });
  }, 120_000);
});
