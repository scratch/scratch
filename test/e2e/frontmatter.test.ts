import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Frontmatter meta tags", () => {
  test("frontmatter is injected as HTML meta tags", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("frontmatter-");
    runCliSync(["create", "sandbox"], tempDir);

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

    // 3. Build without SSG (frontmatter meta tags are injected regardless of SSG)
    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

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

  test("social sharing meta tags are injected correctly", async () => {
    const tempDir = await mkTempDir("frontmatter-social-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");

    await writeFile(
      mdxPath,
      `---
title: Social Test Page
description: Testing social sharing tags
image: /social-image.png
siteName: My Site
locale: en_US
twitterSite: "@mysite"
twitterCreator: "@author"
---

# Social Sharing Test
`
    );

    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // Open Graph tags
    expect(html).toContain('property="og:title" content="Social Test Page"');
    expect(html).toContain('property="og:description" content="Testing social sharing tags"');
    expect(html).toContain('property="og:image" content="/social-image.png"');
    expect(html).toContain('property="og:site_name" content="My Site"');
    expect(html).toContain('property="og:locale" content="en_US"');

    // Twitter tags
    expect(html).toContain('name="twitter:title" content="Social Test Page"');
    expect(html).toContain('name="twitter:image" content="/social-image.png"');
    expect(html).toContain('name="twitter:site" content="@mysite"');
    expect(html).toContain('name="twitter:creator" content="@author"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("siteUrl resolves relative image paths to absolute URLs", async () => {
    const tempDir = await mkTempDir("frontmatter-siteurl-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");

    await writeFile(
      mdxPath,
      `---
title: SiteUrl Test
siteUrl: "https://example.com"
image: /images/og.png
---

# SiteUrl Resolution Test
`
    );

    runCliSync(["build", "sandbox", "--development", "--no-ssg"], tempDir);

    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // Image URLs should be absolute
    expect(html).toContain('property="og:image" content="https://example.com/images/og.png"');
    expect(html).toContain('name="twitter:image" content="https://example.com/images/og.png"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
