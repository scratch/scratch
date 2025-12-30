/**
 * Shared utilities for the build system.
 */

/**
 * Normalize a base path to ensure it starts with / and doesn't end with /
 * Returns empty string for undefined/null/empty input.
 */
export function normalizeBase(base: string | undefined): string {
  if (!base) return '';

  let normalized = base;
  // Ensure starts with /
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  // Remove trailing /
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
