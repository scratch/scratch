import { describe, expect, test } from 'bun:test';
import { normalizeBase } from '../../src/build/util';

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
