import { describe, expect, test } from "bun:test";
import { readFile, rm } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Static Site Generation (SSG)", () => {
  test("build with --no-ssg does not pre-render HTML", async () => {
    // 1. Create a fresh sandbox project
    const tempDir = await mkTempDir("no-ssg-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Build without SSG
    runCliSync(["build", "sandbox", "--no-ssg"], tempDir);

    // 3. Read the generated HTML
    const distDir = path.join(sandboxDir, "dist");
    const html = await readFile(path.join(distDir, "index.html"), "utf-8");

    // 4. Verify SSG flag is false
    expect(html).toContain("window.__SCRATCH_SSG__ = false");

    // 5. Verify the mdx div is empty (no pre-rendered content)
    expect(html).toContain('<div id="mdx"></div>');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
