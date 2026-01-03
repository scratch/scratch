import { describe, expect, test } from 'bun:test';
import { readFile, rm, writeFile } from 'fs/promises';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { runCliSync, mkTempDir, sleep, scratchPath, getAvailablePort } from './util';

describe('Filenames with dots', () => {
  test('builds pages with dots in filename correctly', async () => {
    const tempDir = await mkTempDir('dotted-build-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create a page with dots in the filename
    await writeFile(
      path.join(sandboxDir, 'pages', 'test.file.md'),
      `# Test File

This is a file with dots in the name.
`
    );

    // Build the project
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Verify the output structure: test.file.md -> test.file/index.html
    const distDir = path.join(sandboxDir, 'dist');
    expect(await fs.exists(path.join(distDir, 'test.file', 'index.html'))).toBe(true);

    // Verify the content is correct
    const html = await readFile(path.join(distDir, 'test.file', 'index.html'), 'utf-8');
    expect(html).toContain('Test File');

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('preview server serves pages with dots in filename', async () => {
    const tempDir = await mkTempDir('dotted-preview-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create a page with dots in the filename
    await writeFile(
      path.join(sandboxDir, 'pages', 'test.file.md'),
      `# Test File

This is a file with dots in the name.
`
    );

    // Build the project
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Start the preview server
    const port = await getAvailablePort();
    const previewProc = spawn(scratchPath, [
      'preview',
      'sandbox',
      '--port',
      String(port),
      '--no-open',
    ], {
      cwd: tempDir,
      stdio: 'pipe',
    });

    const stopPreview = () => {
      try {
        previewProc.kill('SIGINT');
      } catch {}
    };

    // Wait for the server to become available and fetch the dotted route
    let html = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const res = await fetch(`http://localhost:${port}/test.file`);
        if (res.ok) {
          html = await res.text();
          break;
        }
      } catch {
        // Server not ready yet
      }
      await sleep(250);
    }

    // Verify the page is served correctly
    expect(html).toContain('Test File');
    expect(html).toContain('This is a file with dots in the name');

    stopPreview();
    await new Promise((resolve) => previewProc.once('exit', resolve));

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('preview server still serves static files with extensions', async () => {
    const tempDir = await mkTempDir('dotted-static-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create a static CSS file in public/
    await writeFile(
      path.join(sandboxDir, 'public', 'custom.css'),
      `body { background: red; }`
    );

    // Build the project
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Start the preview server
    const port = await getAvailablePort();
    const previewProc = spawn(scratchPath, [
      'preview',
      'sandbox',
      '--port',
      String(port),
      '--no-open',
    ], {
      cwd: tempDir,
      stdio: 'pipe',
    });

    const stopPreview = () => {
      try {
        previewProc.kill('SIGINT');
      } catch {}
    };

    // Wait for the server to become available
    let css = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const res = await fetch(`http://localhost:${port}/custom.css`);
        if (res.ok) {
          css = await res.text();
          break;
        }
      } catch {
        // Server not ready yet
      }
      await sleep(250);
    }

    // Verify the CSS file is served directly (not as index.html)
    expect(css).toContain('background: red');

    stopPreview();
    await new Promise((resolve) => previewProc.once('exit', resolve));

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);

  test('handles version-like paths correctly', async () => {
    const tempDir = await mkTempDir('dotted-version-');
    runCliSync(['create', 'sandbox'], tempDir);

    const sandboxDir = path.join(tempDir, 'sandbox');

    // Create a page with version-like path (e.g., v1.2.3)
    await writeFile(
      path.join(sandboxDir, 'pages', 'v1.2.3.md'),
      `# Version 1.2.3

Release notes for version 1.2.3.
`
    );

    // Build the project
    runCliSync(['build', 'sandbox', '--development'], tempDir);

    // Start the preview server
    const port = await getAvailablePort();
    const previewProc = spawn(scratchPath, [
      'preview',
      'sandbox',
      '--port',
      String(port),
      '--no-open',
    ], {
      cwd: tempDir,
      stdio: 'pipe',
    });

    const stopPreview = () => {
      try {
        previewProc.kill('SIGINT');
      } catch {}
    };

    // Wait for the server to become available and fetch the version route
    let html = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const res = await fetch(`http://localhost:${port}/v1.2.3`);
        if (res.ok) {
          html = await res.text();
          break;
        }
      } catch {
        // Server not ready yet
      }
      await sleep(250);
    }

    // Verify the page is served correctly
    expect(html).toContain('Version 1.2.3');

    stopPreview();
    await new Promise((resolve) => previewProc.once('exit', resolve));

    await rm(tempDir, { recursive: true, force: true });
  }, 180_000);
});
