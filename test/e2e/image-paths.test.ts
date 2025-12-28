import { describe, expect, test } from "bun:test";
import { readFile, rm, writeFile, mkdir } from "fs/promises";
import path from "path";
import { runCliSync, mkTempDir } from "./util";

describe("Image path transformation", () => {
  test("transforms relative image paths to absolute paths", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("image-paths-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with relative image paths
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Image Test

![Photo](./photo.png)

<img src="./diagram.png" alt="Diagram" />

Some text between images.

![Another](./images/another.jpg)
`
    );

    // 3. Build with SSG to get pre-rendered HTML
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify relative paths are transformed to absolute paths
    expect(html).toContain('src="/photo.png"');
    expect(html).toContain('src="/diagram.png"');
    expect(html).toContain('src="/images/another.jpg"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("transforms relative paths in nested pages", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("image-paths-nested-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create a nested directory structure
    await mkdir(path.join(sandboxDir, "pages", "blog"), { recursive: true });
    const mdxPath = path.join(sandboxDir, "pages", "blog", "post.mdx");
    await writeFile(
      mdxPath,
      "# Blog Post\n\n![Photo](./photo.png)\n\n![Parent image](../shared/image.svg)\n"
    );

    // 3. Build with SSG
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Read the generated HTML (nested pages output to subdir/index.html)
    const html = await readFile(path.join(sandboxDir, "dist", "blog", "post", "index.html"), "utf-8");

    // 5. Verify paths are resolved relative to the MDX file location
    expect(html).toContain('src="/blog/photo.png"');
    expect(html).toContain('src="/shared/image.svg"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("applies base path prefix when --base is specified", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("image-paths-base-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with relative image paths
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Image Test

![Photo](./photo.png)

<img src="./diagram.png" alt="Diagram" />
`
    );

    // 3. Build with --base flag
    runCliSync(["build", "sandbox", "--development", "--base", "/mysite"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify paths include the base prefix
    expect(html).toContain('src="/mysite/photo.png"');
    expect(html).toContain('src="/mysite/diagram.png"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("skips absolute paths and URLs", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("image-paths-skip-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file with various path types
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Image Test

![Absolute](/absolute/path.png)

![External](https://example.com/image.png)

![Data](data:image/png;base64,ABC123)

<img src="http://example.com/photo.jpg" alt="HTTP" />
`
    );

    // 3. Build with SSG
    runCliSync(["build", "sandbox", "--development"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify these paths are NOT transformed
    expect(html).toContain('src="/absolute/path.png"');
    expect(html).toContain('src="https://example.com/image.png"');
    expect(html).toContain('src="data:image/png;base64,ABC123"');
    expect(html).toContain('src="http://example.com/photo.jpg"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test("normalizes base path with or without slashes", async () => {
    // 1. Create a fresh project
    const tempDir = await mkTempDir("image-paths-base-normalize-");
    runCliSync(["create", "sandbox"], tempDir);

    const sandboxDir = path.join(tempDir, "sandbox");

    // 2. Create an MDX file
    const mdxPath = path.join(sandboxDir, "pages", "index.mdx");
    await writeFile(
      mdxPath,
      `# Image Test

![Photo](./photo.png)
`
    );

    // 3. Build with base path that has trailing slash
    runCliSync(["build", "sandbox", "--development", "--base", "mysite/"], tempDir);

    // 4. Read the generated HTML
    const html = await readFile(path.join(sandboxDir, "dist", "index.html"), "utf-8");

    // 5. Verify base is normalized (should start with / and not have trailing /)
    expect(html).toContain('src="/mysite/photo.png"');
    expect(html).not.toContain('src="mysite//photo.png"');

    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
