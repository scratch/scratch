/**
 * Shared utilities for the build system.
 */

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
