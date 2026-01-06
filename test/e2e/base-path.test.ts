import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCliSync, mkTempDir } from './util';

describe('Base path in HTML shell', () => {
  test('CSS link includes base path', async () => {
    const tempDir = await mkTempDir('base-path-css-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify CSS link includes base path
    expect(html).toMatch(/href="\/mysite\/[^"]*\.css"/);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('JS script includes base path', async () => {
    const tempDir = await mkTempDir('base-path-js-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify JS script includes base path
    expect(html).toMatch(/src="\/mysite\/[^"]*\.js"/);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('favicon includes base path', async () => {
    const tempDir = await mkTempDir('base-path-favicon-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify favicon includes base path
    expect(html).toContain('href="/mysite/favicon.svg"');

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('global variable is injected', async () => {
    const tempDir = await mkTempDir('base-path-global-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with --base flag
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite'], tempDir);

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify global variable is set
    expect(html).toContain('window.__SCRATCH_BASE__ = "/mysite"');

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('no base path when --base not specified', async () => {
    const tempDir = await mkTempDir('base-path-none-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build WITHOUT --base flag
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify no base path prefix (CSS should start with just /)
    expect(html).toMatch(/href="\/[^/][^"]*\.css"/);
    // Verify global variable is set to empty string
    expect(html).toContain('window.__SCRATCH_BASE__ = ""');

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('base path normalization (no leading slash)', async () => {
    const tempDir = await mkTempDir('base-path-normalize-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with base path without leading slash
    runCliSync(['build', 'sandbox', '--development', '--base', 'mysite'], tempDir);

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify base is normalized (should start with /)
    expect(html).toContain('window.__SCRATCH_BASE__ = "/mysite"');
    expect(html).toMatch(/href="\/mysite\/[^"]*\.css"/);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('base path normalization (trailing slash removed)', async () => {
    const tempDir = await mkTempDir('base-path-trailing-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with base path with trailing slash
    runCliSync(['build', 'sandbox', '--development', '--base', '/mysite/'], tempDir);

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8');

    // Verify trailing slash is removed (no double slashes)
    expect(html).toContain('window.__SCRATCH_BASE__ = "/mysite"');
    expect(html).not.toContain('/mysite//');

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});

describe('--test-base flag', () => {
  test('outputs to dist/<base>/ when --test-base is used', async () => {
    const tempDir = await mkTempDir('test-base-output-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with --base and --test-base flags
    runCliSync(
      ['build', 'sandbox', '--development', '--base', '/mysite', '--test-base'],
      tempDir
    );

    // Verify output is in dist/mysite/ not dist/
    const nestedHtmlPath = path.join(sandboxDir, 'dist', 'mysite', 'index.html');
    const rootHtmlPath = path.join(sandboxDir, 'dist', 'index.html');

    expect(await fs.exists(nestedHtmlPath)).toBe(true);
    expect(await fs.exists(rootHtmlPath)).toBe(false);

    // Verify the HTML still has correct base path URLs
    const html = await fs.readFile(nestedHtmlPath, 'utf-8');
    expect(html).toContain('window.__SCRATCH_BASE__ = "/mysite"');
    expect(html).toMatch(/href="\/mysite\/[^"]*\.css"/);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('--test-base without --base outputs to dist/', async () => {
    const tempDir = await mkTempDir('test-base-no-base-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with only --test-base (no --base)
    runCliSync(['build', 'sandbox', '--development', '--test-base'], tempDir);

    // Verify output is still in dist/ (no subdirectory)
    const rootHtmlPath = path.join(sandboxDir, 'dist', 'index.html');
    expect(await fs.exists(rootHtmlPath)).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('--test-base with nested base path', async () => {
    const tempDir = await mkTempDir('test-base-nested-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Build with nested base path
    runCliSync(
      ['build', 'sandbox', '--development', '--base', '/org/repo', '--test-base'],
      tempDir
    );

    // Verify output is in dist/org/repo/
    const nestedHtmlPath = path.join(
      sandboxDir,
      'dist',
      'org',
      'repo',
      'index.html'
    );
    expect(await fs.exists(nestedHtmlPath)).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('--test-base cleans previous build without --test-base', async () => {
    const tempDir = await mkTempDir('test-base-clean-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // First build WITHOUT --test-base (outputs to dist/)
    runCliSync(
      ['build', 'sandbox', '--development', '--base', '/mysite'],
      tempDir
    );

    // Verify first build output exists
    const rootHtmlPath = path.join(sandboxDir, 'dist', 'index.html');
    expect(await fs.exists(rootHtmlPath)).toBe(true);

    // Second build WITH --test-base (outputs to dist/mysite/)
    runCliSync(
      ['build', 'sandbox', '--development', '--base', '/mysite', '--test-base'],
      tempDir
    );

    // Verify old root files are cleaned up
    expect(await fs.exists(rootHtmlPath)).toBe(false);

    // Verify new nested output exists
    const nestedHtmlPath = path.join(sandboxDir, 'dist', 'mysite', 'index.html');
    expect(await fs.exists(nestedHtmlPath)).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
