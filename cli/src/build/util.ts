/**
 * Shared utilities for the build system.
 */

/**
 * Check if a path is relative (not absolute, not a URL, not a special protocol).
 * Used by rehype plugins to determine if paths need transformation.
 */
export function isRelativePath(path: string): boolean {
  const nonRelativePrefixes = ['/', 'http://', 'https://', '//', '#', 'mailto:', 'tel:', 'data:'];
  return !nonRelativePrefixes.some(prefix => path.startsWith(prefix));
}

/**
 * Normalize a base path to ensure it starts with / and doesn't end with /
 * Returns empty string for undefined/null/empty/root-only input.
 */
export function normalizeBase(base: string | undefined): string {
  if (!base || base === '/') return '';

  let normalized = base;
  // Ensure starts with /
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  // Remove trailing /
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Check if a path is an internal absolute path (starting with /).
 * Returns false for protocol-relative URLs (//example.com).
 */
export function isInternalAbsolutePath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  return true;
}
