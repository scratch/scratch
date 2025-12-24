import { describe, expect, test } from "bun:test";
import { readFile, rm } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Static Site Generation (SSG)", () => {
  test("build with SSG pre-renders HTML content", async () => {
    // 1. Create a fresh sandbox project
    const tempDir = await mkTempDir("ssg-");
    runCliSync(["create", "sandbox"], tempDir);
    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Build with SSG (default behavior)
    runCliSync(["build", "sandbox"], tempDir);

    // 3. Read the generated HTML
    const distDir = path.join(sandboxDir, "dist");
    const html = await readFile(path.join(distDir, "index.html"), "utf-8");

    // 4. Verify SSG flag script is present
    expect(html).toContain("window.__scratch_ssg = true");

    // 5. Verify the mdx div contains pre-rendered content (not empty)
    const mdxDivMatch = html.match(/<div id="mdx">([\s\S]*?)<\/div>/);
    expect(mdxDivMatch).toBeTruthy();
    const mdxContent = mdxDivMatch![1].trim();
    expect(mdxContent.length).toBeGreaterThan(0);

    // 6. Verify the pre-rendered content contains expected elements
    // The sandbox index.mdx has the PageWrapper component with content
    expect(mdxContent).toContain("<div");

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

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

    // 4. Verify SSG flag script is NOT present
    expect(html).not.toContain("window.__scratch_ssg = true");

    // 5. Verify the mdx div is empty (no pre-rendered content)
    expect(html).toContain('<div id="mdx"></div>');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
