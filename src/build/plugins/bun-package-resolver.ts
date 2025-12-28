/**
 * Bun plugin to resolve packages from a specified node_modules directory.
 *
 * This allows user projects to use react etc. without having them installed locally,
 * by redirecting imports to the scratch-managed node_modules.
 */
import type { BunPlugin } from 'bun';
import path from 'path';

/**
 * Create a plugin to resolve packages from a specified node_modules directory.
 */
export function createPackageResolverPlugin(nodeModulesDir: string): BunPlugin {
  return {
    name: 'package-resolver',
    setup(build) {
      // Redirect common package imports to the specified node_modules
      const packages = ['react', 'react-dom', '@mdx-js/react'];
      const resolveBase = path.dirname(nodeModulesDir);

      for (const pkg of packages) {
        // Match the package and any subpaths (e.g., react-dom/client, react/jsx-runtime)
        const regex = new RegExp(`^${pkg.replace('/', '\\/')}(\\/.*)?$`);
        build.onResolve({ filter: regex }, async (args) => {
          try {
            // Use Bun.resolve to find the actual entry file from the node_modules parent dir
            const resolved = await Bun.resolve(args.path, resolveBase);
            return { path: resolved };
          } catch (error) {
            // If resolution fails, let Bun try default resolution
            // This can happen if the package isn't installed yet
            return undefined;
          }
        });
      }
    },
  };
}
