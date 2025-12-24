import { describe, expect, test } from "bun:test";
import { rm, writeFile, mkdir } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Page routing", () => {
  test("generates correct HTML files for nested page structure", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("routing-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const pagesDir = path.join(sandboxDir, "pages");

    // 2. Create a nested page structure
    // pages/index.mdx -> /index.html (already exists from template)
    // pages/about.mdx -> /about/index.html
    // pages/posts/index.mdx -> /posts/index.html
    // pages/posts/hello.mdx -> /posts/hello/index.html

    await writeFile(
      path.join(pagesDir, "about.mdx"),
      `# About Page\n\nThis is the about page.`
    );

    await mkdir(path.join(pagesDir, "posts"), { recursive: true });

    await writeFile(
      path.join(pagesDir, "posts", "index.mdx"),
      `# Posts Index\n\nThis is the posts index.`
    );

    await writeFile(
      path.join(pagesDir, "posts", "hello.mdx"),
      `# Hello Post\n\nThis is a blog post.`
    );

    // 3. Build without SSG (routing test only checks that HTML files are generated)
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    const distDir = path.join(sandboxDir, "dist");

    // 4. Verify each page generates at the correct path
    // Without SSG, we can only verify the HTML files exist (content is rendered client-side)

    // index.mdx -> /index.html
    expect(await fs.exists(path.join(distDir, "index.html"))).toBe(true);

    // about.mdx -> /about/index.html
    expect(await fs.exists(path.join(distDir, "about", "index.html"))).toBe(true);

    // posts/index.mdx -> /posts/index.html
    expect(await fs.exists(path.join(distDir, "posts", "index.html"))).toBe(true);

    // posts/hello.mdx -> /posts/hello/index.html
    expect(await fs.exists(path.join(distDir, "posts", "hello", "index.html"))).toBe(true);

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
