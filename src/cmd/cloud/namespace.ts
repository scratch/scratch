// Namespace utilities for Scratch Cloud

// The global namespace value (stored as 'global' in DB, displayed as '_' in URLs)
export const GLOBAL_NAMESPACE = 'global'

// Values that should be normalized to 'global'
const GLOBAL_NAMESPACE_ALIASES = ['_', 'global', '']

// Normalize namespace value - converts aliases to 'global'
export function normalizeNamespace(namespace: string | null | undefined): string {
  if (namespace === null || namespace === undefined) return GLOBAL_NAMESPACE
  if (GLOBAL_NAMESPACE_ALIASES.includes(namespace.toLowerCase())) return GLOBAL_NAMESPACE
  return namespace
}

// Check if a value represents the global namespace
export function isGlobalNamespace(namespace: string | null | undefined): boolean {
  if (namespace === null || namespace === undefined) return true
  return GLOBAL_NAMESPACE_ALIASES.includes(namespace.toLowerCase())
}
