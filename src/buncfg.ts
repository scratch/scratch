import type { BunPlugin, BuildConfig } from 'bun';
import mdx from '@mdx-js/esbuild';
import matter from 'gray-matter';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import { createHighlighter, type Highlighter } from 'shiki';
import { realpathSync } from 'fs';
import { getBuildContext } from './context';
import { createPreprocessMdxPlugin, createRehypeFootnotesPlugin, createNotProsePlugin } from './preprocess';
import path from 'path';
import type { VFile } from 'vfile';

// Cached highlighter instance for reuse across builds
let cachedHighlighter: Highlighter | null = null;

const SHIKI_LANGS = ['javascript', 'typescript', 'jsx', 'tsx', 'css', 'html', 'json', 'bash', 'shell', 'python', 'markdown', 'text'];

async function getShikiHighlighter(): Promise<Highlighter> {
  if (!cachedHighlighter) {
    cachedHighlighter = await createHighlighter({
      themes: ['github-light'],
      langs: SHIKI_LANGS,
    });
  }
  return cachedHighlighter;
}

// Store for frontmatter data (keyed by MDX file path)
export const frontmatterStore = new Map<string, Record<string, any>>();

/**
 * Create a plugin to resolve packages from a specified node_modules directory.
 * This allows user projects to use react etc. without having them installed locally.
 */
export function createPackageResolverPlugin(nodeModulesDir: string): BunPlugin {
  return {
    name: 'package-resolver',
    setup(build) {
      // Redirect common package imports to the specified node_modules
      const packages = ['react', 'react-dom', '@mdx-js/react'];

      for (const pkg of packages) {
        // Match the package and any subpaths (e.g., react-dom/client, react/jsx-runtime)
        const regex = new RegExp(`^${pkg.replace('/', '\\/')}(\\/.*)?$`);
        build.onResolve({ filter: regex }, async (args) => {
          // Use Bun.resolve to find the actual entry file from the node_modules parent dir
          const resolved = await Bun.resolve(args.path, path.dirname(nodeModulesDir));
          return { path: resolved };
        });
      }
    },
  };
}

/**
 * Create a remark plugin that extracts frontmatter and stores it for later HTML injection.
 * This runs during MDX compilation.
 */
export function createFrontmatterRemarkPlugin() {
  const ctx = getBuildContext();

  return () => {
    return async (tree: unknown, file: VFile) => {
      if (!file.path) return;

      const code = await Bun.file(file.path).text();
      const extracted = matter(code);

      // Store frontmatter for later HTML injection
      // Match by entry absPath (resolve symlinks for comparison on macOS)
      const entries = await ctx.getEntries();
      const realFilePath = realpathSync(file.path);

      for (const entry of Object.values(entries)) {
        try {
          const realEntryPath = realpathSync(entry.absPath);
          if (realFilePath === realEntryPath) {
            entry.frontmatterData = extracted.data;
            break;
          }
        } catch {
          // Entry file might not exist, skip
        }
      }
      frontmatterStore.set(realFilePath, extracted.data);
    };
  };
}

export interface BunBuildConfigOptions {
  entryPts: string[];
  outDir: string;
  root: string;
}

/**
 * Get Bun.build() configuration for client build
 */
export async function getBunBuildConfig(options: BunBuildConfigOptions): Promise<BuildConfig> {
  const ctx = getBuildContext();
  const componentMap = await ctx.getComponentMap();
  const componentConflicts = ctx.getComponentConflicts();
  const nodeModulesDir = await ctx.nodeModulesDir();

  // Build remark plugins list
  const remarkPlugins: any[] = [
    // GitHub Flavored Markdown (autolinks, tables, strikethrough, task lists)
    remarkGfm,
    // Parse YAML frontmatter syntax
    remarkFrontmatter,
    // Extract frontmatter data for later HTML injection
    createFrontmatterRemarkPlugin(),
  ];

  // Add preprocessing plugin unless in strict mode
  if (!ctx.options.strict) {
    remarkPlugins.push(createPreprocessMdxPlugin(componentMap, componentConflicts));
    // Add not-prose class to self-closing components
    remarkPlugins.push(createNotProsePlugin());
  }

  // Build rehype plugins list
  const highlighter = await getShikiHighlighter();
  const rehypePlugins: any[] = [
    [rehypeShikiFromHighlighter, highlighter, { theme: 'github-light' }],
  ];
  if (!ctx.options.strict) {
    rehypePlugins.push(createRehypeFootnotesPlugin());
  }

  // Create MDX plugin with remark preprocessing
  const mdxPlugin = mdx({
    providerImportSource: '@mdx-js/react',
    remarkPlugins,
    rehypePlugins,
  });

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
      'process.env.NODE_ENV': ctx.options.development ? '"development"' : '"production"',
    },

    plugins: [
      createPackageResolverPlugin(nodeModulesDir),
      mdxPlugin,
    ],
  };
}

/**
 * Get Bun.build() configuration for server-side SSG build
 */
export async function getServerBunBuildConfig(options: BunBuildConfigOptions): Promise<BuildConfig> {
  const ctx = getBuildContext();
  const componentMap = await ctx.getComponentMap();
  const componentConflicts = ctx.getComponentConflicts();
  const nodeModulesDir = await ctx.nodeModulesDir();

  // Build remark plugins list (same as client, but no frontmatter extraction needed)
  const remarkPlugins: any[] = [
    // GitHub Flavored Markdown (autolinks, tables, strikethrough, task lists)
    remarkGfm,
    remarkFrontmatter,
  ];

  if (!ctx.options.strict) {
    remarkPlugins.push(createPreprocessMdxPlugin(componentMap, componentConflicts));
    // Add not-prose class to self-closing components
    remarkPlugins.push(createNotProsePlugin());
  }

  // Build rehype plugins list
  const highlighter = await getShikiHighlighter();
  const rehypePlugins: any[] = [
    [rehypeShikiFromHighlighter, highlighter, { theme: 'github-light' }],
  ];
  if (!ctx.options.strict) {
    rehypePlugins.push(createRehypeFootnotesPlugin());
  }

  const mdxPlugin = mdx({
    providerImportSource: '@mdx-js/react',
    remarkPlugins,
    rehypePlugins,
  });

  return {
    entrypoints: options.entryPts,
    outdir: options.outDir,
    root: options.root,

    target: 'bun',  // Server-side target
    format: 'esm',
    splitting: false,  // No code splitting for server modules
    minify: false,     // No minification needed for server
    sourcemap: 'none',

    naming: {
      entry: '[dir]/[name].[ext]',
    },

    define: {
      // Always use development mode for SSG server build to get helpful React error messages.
      // This code only runs at build time and is never shipped to the browser.
      'process.env.NODE_ENV': '"development"',
    },

    plugins: [
      createPackageResolverPlugin(nodeModulesDir),
      mdxPlugin,
    ],
  };
}
