import { describe, expect, test } from 'bun:test';
import { readFile, rm, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { runCliSync, mkTempDir } from './util';

describe('Relative link .md/.mdx extension stripping', () => {
  test('strips .md extension from relative markdown links', async () => {
    const tempDir = await mkTempDir('link-md-ext-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create MDX file with relative links using .md extension
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[About page](about.md)

[Contact](contact.md)

Some text.
`
    );

    // Create the target pages
    await writeFile(path.join(sandboxDir, 'pages', 'about.md'), '# About');
    await writeFile(path.join(sandboxDir, 'pages', 'contact.md'), '# Contact');

    // Build without base path
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify .md extensions are stripped
    expect(html).toContain('href="about"');
    expect(html).toContain('href="contact"');
    expect(html).not.toContain('href="about.md"');
    expect(html).not.toContain('href="contact.md"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('strips .mdx extension from relative markdown links', async () => {
    const tempDir = await mkTempDir('link-mdx-ext-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create MDX file with relative links using .mdx extension
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[Guide](guide.mdx)

Some text.
`
    );

    // Create the target page
    await writeFile(path.join(sandboxDir, 'pages', 'guide.mdx'), '# Guide');

    // Build without base path
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify .mdx extension is stripped
    expect(html).toContain('href="guide"');
    expect(html).not.toContain('href="guide.mdx"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('strips extensions from nested relative links', async () => {
    const tempDir = await mkTempDir('link-nested-ext-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create MDX file with nested relative links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[Nested guide](docs/guide.md)

[Parent](../other.mdx)

Some text.
`
    );

    // Create the target pages
    await mkdir(path.join(sandboxDir, 'pages', 'docs'), { recursive: true });
    await writeFile(path.join(sandboxDir, 'pages', 'docs', 'guide.md'), '# Guide');

    // Build without base path
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify extensions are stripped from nested paths
    expect(html).toContain('href="docs/guide"');
    expect(html).toContain('href="../other"');
    expect(html).not.toContain('href="docs/guide.md"');
    expect(html).not.toContain('href="../other.mdx"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('does not strip .md from absolute internal paths', async () => {
    const tempDir = await mkTempDir('link-abs-md-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create MDX file with absolute path containing .md
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[Absolute link](/about.md)

Some text.
`
    );

    // Build without base path
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify absolute paths are NOT transformed
    expect(html).toContain('href="/about.md"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('does not strip .md from external URLs', async () => {
    const tempDir = await mkTempDir('link-ext-md-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create MDX file with external URL containing .md
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[External](https://example.com/readme.md)

Some text.
`
    );

    // Build without base path
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify external URLs are NOT transformed
    expect(html).toContain('href="https://example.com/readme.md"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('strips .md extension in raw HTML links', async () => {
    const tempDir = await mkTempDir('link-raw-md-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create MDX file with raw HTML links containing .md
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

<a href="about.md">About page</a>

Some text.
`
    );

    // Create the target page
    await writeFile(path.join(sandboxDir, 'pages', 'about.md'), '# About');

    // Build without base path
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify .md extension is stripped from raw HTML links
    expect(html).toContain('href="about"');
    expect(html).not.toContain('href="about.md"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});

describe('Link path transformation with base path', () => {
  test('transforms markdown internal links', async () => {
    const tempDir = await mkTempDir('link-paths-md-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create an MDX file with internal links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[About page](/about)

[Contact](/contact/us)

Some text.
`
    );

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify internal links are transformed
    expect(html).toContain('href="/mysite/about"');
    expect(html).toContain('href="/mysite/contact/us"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('transforms raw HTML internal links', async () => {
    const tempDir = await mkTempDir('link-paths-html-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create an MDX file with raw HTML links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

<a href="/about">About page</a>

<a href="/docs/guide">Guide</a>

Some text.
`
    );

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify raw HTML links are transformed
    expect(html).toContain('href="/mysite/about"');
    expect(html).toContain('href="/mysite/docs/guide"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('does not transform external links', async () => {
    const tempDir = await mkTempDir('link-paths-external-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create an MDX file with external links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[Google](https://google.com)

[HTTP](http://example.com)

<a href="https://github.com">GitHub</a>

Some text.
`
    );

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify external links are NOT transformed
    expect(html).toContain('href="https://google.com"');
    expect(html).toContain('href="http://example.com"');
    expect(html).toContain('href="https://github.com"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('does not transform anchor links', async () => {
    const tempDir = await mkTempDir('link-paths-anchor-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create an MDX file with anchor links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[Jump to section](#section)

<a href="#another">Another section</a>

Some text.
`
    );

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify anchor links are NOT transformed
    expect(html).toContain('href="#section"');
    expect(html).toContain('href="#another"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('does not transform mailto links', async () => {
    const tempDir = await mkTempDir('link-paths-mailto-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create an MDX file with mailto links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[Email us](mailto:test@example.com)

<a href="mailto:hello@world.com">Contact</a>

Some text.
`
    );

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify mailto links are NOT transformed
    expect(html).toContain('href="mailto:test@example.com"');
    expect(html).toContain('href="mailto:hello@world.com"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('does not transform relative links', async () => {
    const tempDir = await mkTempDir('link-paths-relative-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create an MDX file with relative links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[Sibling](./sibling)

[Parent](../parent)

<a href="./another">Another</a>

Some text.
`
    );

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify relative links are NOT transformed (only absolute / paths)
    expect(html).toContain('href="./sibling"');
    expect(html).toContain('href="../parent"');
    expect(html).toContain('href="./another"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('no transformation when --base not specified', async () => {
    const tempDir = await mkTempDir('link-paths-no-base-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create an MDX file with internal links
    const mdxPath = path.join(sandboxDir, 'pages', 'index.mdx');
    await writeFile(
      mdxPath,
      `# Link Test

[About page](/about)

Some text.
`
    );

    // Build WITHOUT --base flag
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify links are NOT transformed (no base prefix)
    expect(html).toContain('href="/about"');
    expect(html).not.toContain('href="/mysite/about"');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
