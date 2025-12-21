import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile, mkdir } from "fs/promises";
import fs from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Page routing", () => {
  test("generates correct HTML files for nested page structure", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("routing-");
    runCliSync(["init", "sandbox", "--full"], tempDir);

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

    // 3. Build with SSG
    runCliSync(["build", "sandbox", "--ssg", "--development"], tempDir);

    const distDir = path.join(sandboxDir, "dist");

    // 4. Verify each page generates at the correct path
    // index.mdx -> /index.html
    expect(await fs.exists(path.join(distDir, "index.html"))).toBe(true);
    const indexHtml = await readFile(path.join(distDir, "index.html"), "utf-8");
    expect(indexHtml).toContain("html");

    // about.mdx -> /about/index.html
    expect(await fs.exists(path.join(distDir, "about", "index.html"))).toBe(true);
    const aboutHtml = await readFile(path.join(distDir, "about", "index.html"), "utf-8");
    expect(aboutHtml).toContain("About Page");

    // posts/index.mdx -> /posts/index.html
    expect(await fs.exists(path.join(distDir, "posts", "index.html"))).toBe(true);
    const postsIndexHtml = await readFile(path.join(distDir, "posts", "index.html"), "utf-8");
    expect(postsIndexHtml).toContain("Posts Index");

    // posts/hello.mdx -> /posts/hello/index.html
    expect(await fs.exists(path.join(distDir, "posts", "hello", "index.html"))).toBe(true);
    const helloHtml = await readFile(path.join(distDir, "posts", "hello", "index.html"), "utf-8");
    expect(helloHtml).toContain("Hello Post");

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
