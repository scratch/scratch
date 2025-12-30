/**
 * Bun.build() configuration for client and server builds.
 *
 * This module provides build configuration factories that assemble
 * plugins from ./plugins for MDX compilation.
 */
import type { BunPlugin, BuildConfig } from 'bun';
import mdx from '@mdx-js/esbuild';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { BuildContext } from './context';
import {
  createAutoImportPlugin,
  createNotProsePlugin,
  createFootnotesPlugin,
  createFrontmatterPlugin,
  createShikiPlugin,
  createPackageResolverPlugin,
  createImagePathsPlugin,
  createLinkPathsPlugin,
} from './plugins';

export interface BunBuildConfigOptions {
  entryPts: string[];
  outDir: string;
  root: string;
}

// MDX node types that should pass through rehype-raw unchanged
const MDX_NODE_TYPES = [
  'mdxjsEsm',
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
];

/**
 * Create the MDX plugin with remark/rehype preprocessing.
 */
async function createMdxBuildPlugin(
  ctx: BuildContext,
  options: { extractFrontmatter?: boolean } = {}
): Promise<BunPlugin> {
  const { extractFrontmatter = false } = options;
  const componentMap = await ctx.getComponentMap();
  const componentConflicts = ctx.getComponentConflicts();

  // Build remark plugins list
  const remarkPlugins: any[] = [remarkGfm, remarkFrontmatter];

  if (extractFrontmatter) {
    remarkPlugins.push(createFrontmatterPlugin(ctx));
  }

  if (!ctx.options.strict) {
    remarkPlugins.push(createAutoImportPlugin(componentMap, componentConflicts));
    remarkPlugins.push(createNotProsePlugin());
  }

  // Build rehype plugins list
  // rehype-raw processes raw HTML in markdown, with passThrough to preserve MDX nodes
  const rehypePlugins: any[] = [[rehypeRaw, { passThrough: MDX_NODE_TYPES }]];

  // Transform relative image paths to absolute static routes
  rehypePlugins.push(createImagePathsPlugin(ctx));

  // Transform internal link paths to include base path
  rehypePlugins.push(createLinkPathsPlugin(ctx));

  // Add shiki syntax highlighting unless disabled
  const shikiPlugin = await createShikiPlugin(ctx);
  if (shikiPlugin) {
    rehypePlugins.push(shikiPlugin);
  }

  if (!ctx.options.strict) {
    rehypePlugins.push(createFootnotesPlugin());
  }

  return mdx({
    providerImportSource: '@mdx-js/react',
    remarkPlugins,
    rehypePlugins,
    remarkRehypeOptions: {
      passThrough: MDX_NODE_TYPES,
    },
  });
}

/**
 * Get Bun.build() configuration for client build
 */
export async function getBunBuildConfig(
  ctx: BuildContext,
  options: BunBuildConfigOptions
): Promise<BuildConfig> {
  const nodeModulesDir = await ctx.nodeModulesDir();
  const mdxPlugin = await createMdxBuildPlugin(ctx, { extractFrontmatter: true });

  return {
    entrypoints: options.entryPts,
    outdir: options.outDir,
    root: options.root,

    target: 'browser',
    format: 'esm',
    splitting: true,
    minify: !ctx.options.development,
    sourcemap: ctx.options.development ? 'linked' : 'none',

    naming: {
      entry: '[dir]/[name]-[hash].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]',
      asset: 'assets/[name]-[hash].[ext]',
    },

    define: {
      'process.env.NODE_ENV': ctx.options.development
        ? '"development"'
        : '"production"',
    },

    plugins: [createPackageResolverPlugin(nodeModulesDir), mdxPlugin],
  };
}

/**
 * Get Bun.build() configuration for server-side SSG build
 */
export async function getServerBunBuildConfig(
  ctx: BuildContext,
  options: BunBuildConfigOptions
): Promise<BuildConfig> {
  const nodeModulesDir = await ctx.nodeModulesDir();
  const mdxPlugin = await createMdxBuildPlugin(ctx);

  return {
    entrypoints: options.entryPts,
    outdir: options.outDir,
    root: options.root,

    target: 'bun',
    format: 'esm',
    // Enable splitting to share common code (React, etc.) across server modules
    // This significantly reduces the size of each module and speeds up imports
    splitting: true,
    minify: false,
    sourcemap: 'none',

    naming: {
      entry: '[dir]/[name].[ext]',
      chunk: 'chunks/[name]-[hash].[ext]',
    },

    define: {
      // Always use development mode for SSG server build to get helpful React error messages.
      // This code only runs at build time and is never shipped to the browser.
      'process.env.NODE_ENV': '"development"',
    },

    plugins: [createPackageResolverPlugin(nodeModulesDir), mdxPlugin],
  };
}
