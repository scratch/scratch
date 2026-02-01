import { describe, expect, test } from 'bun:test'
import fs from 'fs/promises'
import path from 'path'
import { runCliSync, mkTempDir } from './util'

/**
 * E2E tests for the --www flag build behavior.
 *
 * When --www is used with publish, the build uses an empty base path
 * so the site can be served at the root domain without path prefix.
 *
 * These tests verify the build output when using empty base path,
 * which simulates what happens during `scratch publish --www`.
 */

describe('www mode build (empty base path)', () => {
  test('build with empty base path has no path prefix in assets', async () => {
    const tempDir = await mkTempDir('www-build-empty-')
    runCliSync(['create', 'sandbox'], tempDir)

    const sandboxDir = path.join(tempDir, 'sandbox')

    // Build with empty base path (simulates --www mode)
    runCliSync(['build', 'sandbox', '--development', '--base', ''], tempDir)

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8')

    // Verify no base path prefix - assets should be at root
    // CSS should be like href="/something.css" not href="/user/project/something.css"
    expect(html).toMatch(/href="\/[^/][^"]*\.css"/)

    // Global variable should be empty string
    expect(html).toContain('window.__SCRATCH_BASE__ = ""')

    await fs.rm(tempDir, { recursive: true, force: true })
  }, 180_000)

  test('build with empty base path vs user/project base path differs', async () => {
    // Build two projects - one with empty base path (www mode) and one with user/project path
    const tempDir = await mkTempDir('www-build-compare-')
    runCliSync(['create', 'sandbox1'], tempDir)
    runCliSync(['create', 'sandbox2'], tempDir)

    const sandbox1Dir = path.join(tempDir, 'sandbox1')
    const sandbox2Dir = path.join(tempDir, 'sandbox2')

    // Build sandbox1 with empty base (www mode)
    runCliSync(['build', 'sandbox1', '--development', '--base', ''], tempDir)

    // Build sandbox2 with typical user/project base path
    runCliSync(['build', 'sandbox2', '--development', '--base', '/user123/my-project'], tempDir)

    // Read both HTML files
    const html1 = await fs.readFile(path.join(sandbox1Dir, 'dist', 'index.html'), 'utf-8')
    const html2 = await fs.readFile(path.join(sandbox2Dir, 'dist', 'index.html'), 'utf-8')

    // Verify empty base has no path prefix
    expect(html1).toContain('window.__SCRATCH_BASE__ = ""')
    expect(html1).not.toContain('/user123/my-project/')

    // Verify user/project base has path prefix
    expect(html2).toContain('window.__SCRATCH_BASE__ = "/user123/my-project"')
    expect(html2).toContain('/user123/my-project/')

    await fs.rm(tempDir, { recursive: true, force: true })
  }, 180_000)

  test('build with empty base path works with SSG', async () => {
    const tempDir = await mkTempDir('www-build-ssg-')
    runCliSync(['create', 'sandbox'], tempDir)

    const sandboxDir = path.join(tempDir, 'sandbox')

    // Build with SSG and empty base path
    runCliSync(['build', 'sandbox', '--base', ''], tempDir)

    // Verify dist exists and has expected files
    const distExists = await fs.exists(path.join(sandboxDir, 'dist'))
    expect(distExists).toBe(true)

    const indexExists = await fs.exists(path.join(sandboxDir, 'dist', 'index.html'))
    expect(indexExists).toBe(true)

    // Read the generated HTML
    const html = await fs.readFile(path.join(sandboxDir, 'dist', 'index.html'), 'utf-8')
    expect(html).toContain('window.__SCRATCH_BASE__ = ""')

    await fs.rm(tempDir, { recursive: true, force: true })
  }, 180_000)
})
