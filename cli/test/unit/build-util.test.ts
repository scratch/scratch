import { describe, expect, test } from 'bun:test';
import { normalizeBase, isRelativePath } from '../../src/build/util';

describe('normalizeBase', () => {
  test('returns empty string for undefined', () => {
    expect(normalizeBase(undefined)).toBe('');
  });

  test('returns empty string for empty string', () => {
    expect(normalizeBase('')).toBe('');
  });

  test('adds leading slash if missing', () => {
    expect(normalizeBase('mysite')).toBe('/mysite');
  });

  test('removes trailing slash', () => {
    expect(normalizeBase('/mysite/')).toBe('/mysite');
  });

  test('handles both missing leading and trailing slash', () => {
    expect(normalizeBase('mysite/')).toBe('/mysite');
  });

  test('preserves valid input unchanged', () => {
    expect(normalizeBase('/mysite')).toBe('/mysite');
  });

  test('handles nested paths', () => {
    expect(normalizeBase('foo/bar/baz')).toBe('/foo/bar/baz');
    expect(normalizeBase('/foo/bar/baz/')).toBe('/foo/bar/baz');
  });

  test('handles single slash (root path)', () => {
    // Single slash should return empty string (no base path needed for root)
    expect(normalizeBase('/')).toBe('');
  });
});

describe('isRelativePath', () => {
  test('returns true for relative paths', () => {
    expect(isRelativePath('foo.png')).toBe(true);
    expect(isRelativePath('./foo.png')).toBe(true);
    expect(isRelativePath('../images/foo.png')).toBe(true);
    expect(isRelativePath('images/foo.png')).toBe(true);
    expect(isRelativePath('about.md')).toBe(true);
  });

  test('returns false for absolute paths', () => {
    expect(isRelativePath('/foo.png')).toBe(false);
    expect(isRelativePath('/images/foo.png')).toBe(false);
  });

  test('returns false for HTTP URLs', () => {
    expect(isRelativePath('http://example.com/foo.png')).toBe(false);
    expect(isRelativePath('https://example.com/foo.png')).toBe(false);
  });

  test('returns false for protocol-relative URLs', () => {
    expect(isRelativePath('//example.com/foo.png')).toBe(false);
  });

  test('returns false for hash links', () => {
    expect(isRelativePath('#section')).toBe(false);
    expect(isRelativePath('#top')).toBe(false);
  });

  test('returns false for mailto links', () => {
    expect(isRelativePath('mailto:test@example.com')).toBe(false);
  });

  test('returns false for tel links', () => {
    expect(isRelativePath('tel:+1234567890')).toBe(false);
  });

  test('returns false for data URIs', () => {
    expect(isRelativePath('data:image/png;base64,abc123')).toBe(false);
  });
});
