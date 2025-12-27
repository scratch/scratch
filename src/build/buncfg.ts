import type { BunPlugin, BuildConfig } from 'bun';
import mdx from '@mdx-js/esbuild';
import matter from 'gray-matter';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import { createHighlighter, bundledLanguages, type Highlighter, type BundledLanguage } from 'shiki';
import { realpathSync } from 'fs';
import { BuildContext, type HighlightMode } from './context';
import { createPreprocessMdxPlugin, createRehypeFootnotesPlugin, createNotProsePlugin } from './preprocess';
import path from 'path';
import type { VFile } from 'vfile';
import log from '../logger';

// Set of all valid shiki language identifiers for validation
const VALID_LANGUAGES = new Set(Object.keys(bundledLanguages));

// Popular languages for the 'popular' highlight mode
export const POPULAR_LANGUAGES: BundledLanguage[] = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'html', 'css', 'json', 'yaml', 'markdown',
  'python', 'ruby', 'go', 'rust', 'java',
  'c', 'cpp', 'csharp', 'php', 'swift',
  'bash', 'shell', 'sql', 'graphql', 'diff',
];

/**
 * Scan files and extract code fence language identifiers.
 * Returns only languages that are valid shiki languages.
 * @param filePaths - Array of absolute file paths to scan
 */
export async function detectLanguagesFromFiles(filePaths: string[]): Promise<BundledLanguage[]> {
  const detectedLangs = new Set<string>();

  // Regex to match code fence language identifiers: ```lang or ```lang{...}
  const codeFenceRegex = /^```(\w+)/gm;

  await Promise.all(filePaths.map(async (file) => {
    const content = await Bun.file(file).text();
    let match;
    while ((match = codeFenceRegex.exec(content)) !== null) {
      const lang = match[1]!.toLowerCase();
      if (VALID_LANGUAGES.has(lang)) {
        detectedLangs.add(lang);
      }
    }
  }));

  const langs = Array.from(detectedLangs) as BundledLanguage[];
  if (langs.length > 0) {
    log.debug(`Detected ${langs.length} code languages: ${langs.join(', ')}`);
  }
  return langs;
}

// Cached highlighter instance for reuse across builds
let cachedHighlighter: Highlighter | null = null;
let cachedHighlighterLangs: string | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Get or create a shiki highlighter with the specified languages.
 * Caches the highlighter for reuse, recreating if languages change.
 */
async function getShikiHighlighter(langs: BundledLanguage[]): Promise<Highlighter> {
  const langsKey = [...langs].sort().join(',');

  // Return cached highlighter if languages haven't changed
  if (cachedHighlighter && cachedHighlighterLangs === langsKey) {
    return cachedHighlighter;
  }

  // If creation is in progress with same languages, wait for it
  if (highlighterPromise && cachedHighlighterLangs === langsKey) {
    return highlighterPromise;
  }

  // Create new highlighter with detected languages
  const t0 = performance.now();
  const langsToLoad = langs.length > 0 ? langs : ['plaintext' as BundledLanguage];
  cachedHighlighterLangs = langsKey;

  highlighterPromise = createHighlighter({
    themes: ['github-light'],
    langs: langsToLoad,
  }).then(h => {
    cachedHighlighter = h;
    log.debug(`Shiki highlighter created in ${(performance.now() - t0).toFixed(0)}ms (${langsToLoad.length} languages)`);
    return h;
  });

  return highlighterPromise;
}

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

/**
 * Create a remark plugin that extracts frontmatter and stores it for later HTML injection.
 * This runs during MDX compilation.
 */
function createFrontmatterRemarkPlugin(ctx: BuildContext) {
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
    };
  };
}

export interface BunBuildConfigOptions {
  entryPts: string[];
  outDir: string;
  root: string;
}

// Cache detected languages to avoid re-scanning files
let detectedLanguagesCache: BundledLanguage[] | null = null;
let detectedLanguagesPromise: Promise<BundledLanguage[]> | null = null;

/**
 * Get the languages to load based on highlight mode.
 * For 'auto' mode, uses entries from context to avoid duplicate glob searches.
 */
async function getLanguagesForMode(ctx: BuildContext, mode: HighlightMode): Promise<BundledLanguage[]> {
  switch (mode) {
    case 'off':
      return [];
    case 'popular':
      return POPULAR_LANGUAGES;
    case 'all':
      return Object.keys(bundledLanguages) as BundledLanguage[];
    case 'auto':
    default:
      // Auto-detect languages from code fences in MDX files (cached across builds)
      // Use promise-based caching to handle concurrent calls
      if (detectedLanguagesCache) {
        return detectedLanguagesCache;
      } else if (detectedLanguagesPromise) {
        // Detection in progress, wait for it
        detectedLanguagesCache = await detectedLanguagesPromise;
        return detectedLanguagesCache;
      } else {
        // Start detection - reuse entries from context instead of separate glob
        const entries = await ctx.getEntries();
        const filePaths = Object.values(entries).map(entry => entry.absPath);
        detectedLanguagesPromise = detectLanguagesFromFiles(filePaths);
        detectedLanguagesCache = await detectedLanguagesPromise;
        return detectedLanguagesCache;
      }
  }
}

/**
 * Create the MDX plugin with remark/rehype preprocessing.
 */
async function createMdxBuildPlugin(ctx: BuildContext, options: { extractFrontmatter?: boolean } = {}): Promise<BunPlugin> {
  const { extractFrontmatter = false } = options;
  const componentMap = await ctx.getComponentMap();
  const componentConflicts = ctx.getComponentConflicts();
  const highlightMode = ctx.options.highlight || 'auto';

  // Build remark plugins list
  const remarkPlugins: any[] = [remarkGfm, remarkFrontmatter];

  if (extractFrontmatter) {
    remarkPlugins.push(createFrontmatterRemarkPlugin(ctx));
  }

  if (!ctx.options.strict) {
    remarkPlugins.push(createPreprocessMdxPlugin(componentMap, componentConflicts));
    remarkPlugins.push(createNotProsePlugin());
  }

  // Build rehype plugins list
  const rehypePlugins: any[] = [];

  // Add shiki syntax highlighting unless disabled
  if (highlightMode !== 'off') {
    const langs = await getLanguagesForMode(ctx, highlightMode);
    const highlighter = await getShikiHighlighter(langs);
    rehypePlugins.push([rehypeShikiFromHighlighter, highlighter, { theme: 'github-light' }]);
  }

  if (!ctx.options.strict) {
    rehypePlugins.push(createRehypeFootnotesPlugin());
  }

  return mdx({
    providerImportSource: '@mdx-js/react',
    remarkPlugins,
    rehypePlugins,
  });
}

/**
 * Reset the detected languages cache (called when files change in dev mode)
 */
export function resetLanguageCache(): void {
  detectedLanguagesCache = null;
  detectedLanguagesPromise = null;
  cachedHighlighter = null;
  cachedHighlighterLangs = null;
  highlighterPromise = null;
}

/**
 * Get Bun.build() configuration for client build
 */
export async function getBunBuildConfig(ctx: BuildContext, options: BunBuildConfigOptions): Promise<BuildConfig> {
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
export async function getServerBunBuildConfig(ctx: BuildContext, options: BunBuildConfigOptions): Promise<BuildConfig> {
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

    plugins: [
      createPackageResolverPlugin(nodeModulesDir),
      mdxPlugin,
    ],
  };
}
