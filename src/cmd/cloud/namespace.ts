// Namespace utilities for Scratch Cloud
// Reserved namespace values that mean "global namespace" (stored as NULL)

const GLOBAL_NAMESPACE_ALIASES = ['_', 'global']

// Normalize namespace value - converts aliases to null
export function normalizeNamespace(namespace: string | null | undefined): string | null {
  if (namespace === null || namespace === undefined) return null
  if (GLOBAL_NAMESPACE_ALIASES.includes(namespace.toLowerCase())) return null
  return namespace
}

// Check if a value represents the global namespace
export function isGlobalNamespace(namespace: string | null | undefined): boolean {
  if (namespace === null || namespace === undefined) return true
  return GLOBAL_NAMESPACE_ALIASES.includes(namespace.toLowerCase())
}
