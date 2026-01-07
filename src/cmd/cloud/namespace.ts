// Re-export namespace utilities from shared package
export {
  GLOBAL_NAMESPACE,
  normalizeNamespace,
  isGlobalNamespace,
} from '../../../../../scratch-monorepo/shared/src/project'

/**
 * Format namespace for display.
 * Shows "global" for the global namespace, otherwise the namespace value.
 */
export function formatNamespace(namespace: string | null | undefined): string {
  if (namespace === null || namespace === undefined || namespace === 'global') {
    return 'global'
  }
  return namespace
}
