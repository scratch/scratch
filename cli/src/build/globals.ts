/**
 * Global variables injected into the build for both SSR and client-side access.
 * These are set on globalThis during SSR and window in the browser.
 */

export interface ScratchGlobals {
  /** Base path for deployment (e.g., '/mysite'). Empty string if no base. */
  __SCRATCH_BASE__: string;
  /** Whether SSG (server-side generation) is enabled */
  __SCRATCH_SSG__: boolean;
}

/**
 * Build the globals object from build options.
 */
export function buildGlobals(options: {
  base?: string;
  ssg?: boolean;
}): ScratchGlobals {
  return {
    __SCRATCH_BASE__: options.base || '',
    __SCRATCH_SSG__: options.ssg ?? false,
  };
}

/**
 * Generate a script tag that sets globals on window for client-side access.
 */
export function generateGlobalsScript(globals: ScratchGlobals): string {
  const assignments = Object.entries(globals)
    .map(([key, value]) => `window.${key} = ${JSON.stringify(value)};`)
    .join(' ');
  return `<script>${assignments}</script>`;
}

/**
 * Generate JavaScript code that sets globals on globalThis for SSR.
 */
export function generateGlobalsAssignment(globals: ScratchGlobals): string {
  return Object.entries(globals)
    .map(([key, value]) => `globalThis.${key} = ${JSON.stringify(value)};`)
    .join('\n');
}
