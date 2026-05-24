import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { mkTempDir } from '../../test-util';
import { ensureDistDir, resolveEnvironment, resolveProjectName, resolveRootDir } from '../../../src/cmd/deploy/preflight';

describe('deploy preflight', () => {
  test('resolveEnvironment defaults to preview', () => {
    expect(resolveEnvironment({})).toBe('preview');
    expect(resolveEnvironment({ prod: true })).toBe('prod');
  });

  test('resolveEnvironment rejects conflicting flags', () => {
    expect(() => resolveEnvironment({ prod: true, preview: true })).toThrow(/Choose either --prod or --preview/);
  });

  test('resolveRootDir returns an absolute path', () => {
    expect(path.isAbsolute(resolveRootDir('.'))).toBe(true);
  });

  test('resolveProjectName uses explicit project when provided', async () => {
    const name = await resolveProjectName('/tmp/test', { project: 'my-site' });
    expect(name).toBe('my-site');
  });

  test('resolveProjectName falls back to directory name for non-interactive mode', async () => {
    const name = await resolveProjectName('/tmp/example-site', { yes: true });
    expect(name).toBe('example-site');
  });

  test('ensureDistDir accepts existing dist directory', async () => {
    const tempDir = await mkTempDir('deploy-preflight-');
    try {
      await fs.mkdir(path.join(tempDir, 'dist'), { recursive: true });
      const dist = await ensureDistDir(tempDir);
      expect(dist).toBe(path.join(tempDir, 'dist'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('ensureDistDir throws when dist is missing', async () => {
    const tempDir = await mkTempDir('deploy-preflight-');
    try {
      await expect(ensureDistDir(tempDir)).rejects.toThrow(/dist\/ directory not found/);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('resolveProjectName trims whitespace from explicit name', async () => {
    const name = await resolveProjectName('/tmp/test', { project: '  my-site  ' });
    expect(name).toBe('my-site');
  });

  test('resolveProjectName falls back to scratch-site for root path', async () => {
    const name = await resolveProjectName('/', { yes: true });
    expect(name).toBe('scratch-site');
  });

  test('resolveRootDir resolves relative paths', () => {
    const result = resolveRootDir('some/relative/path');
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toContain('some/relative/path');
  });

  test('resolveRootDir defaults to cwd for empty string', () => {
    const result = resolveRootDir('');
    expect(result).toBe(path.resolve('.'));
  });
});
