import { describe, expect, test } from 'bun:test';
import { readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { runCliSync, mkTempDir } from './util';

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
