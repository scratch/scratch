import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Frontmatter meta tags", () => {
  test("frontmatter is injected as HTML meta tags", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("frontmatter-");
    runCliSync(["init", "sandbox", "--full"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with frontmatter
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `---
title: My Test Page Title
description: This is a test description for SEO
keywords: test, frontmatter, meta
author: Test Author
---

# Hello World

This page has frontmatter metadata.
`
    );

    // 3. Build with SSG
    runCliSync(["build", "sandbox", "--ssg", "--development"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify meta tags are present
    expect(html).toContain('<title>My Test Page Title</title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('This is a test description for SEO');
    expect(html).toContain('name="keywords"');
    expect(html).toContain('test, frontmatter, meta');
    expect(html).toContain('name="author"');
    expect(html).toContain('Test Author');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
