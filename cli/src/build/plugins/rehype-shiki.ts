/**
 * Rehype plugin for syntax highlighting using Shiki.
 *
 * This module handles:
 * - Language detection from code fences in MDX files
 * - Shiki highlighter creation and caching
 * - Rehype plugin creation for syntax highlighting
 */
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import {
  createHighlighter,
  bundledLanguages,
  type Highlighter,
  type BundledLanguage,
} from 'shiki';
import type { BuildContext, HighlightMode } from '../context';
import log from '../../logger';

// Set of all valid shiki language identifiers for validation
const VALID_LANGUAGES = new Set(Object.keys(bundledLanguages));

// Popular languages for the 'popular' highlight mode
export const POPULAR_LANGUAGES: BundledLanguage[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'html',
  'css',
  'json',
  'yaml',
  'markdown',
  'python',
  'ruby',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'csharp',
  'php',
  'swift',
  'bash',
  'shell',
  'sql',
  'graphql',
  'diff',
];

// Cached highlighter instance for reuse across builds
let cachedHighlighter: Highlighter | null = null;
let cachedHighlighterLangs: string | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

// Cache detected languages to avoid re-scanning files
let detectedLanguagesCache: BundledLanguage[] | null = null;
let detectedLanguagesPromise: Promise<BundledLanguage[]> | null = null;

/**
 * Scan files and extract code fence language identifiers.
 * Returns only languages that are valid shiki languages.
 * @param filePaths - Array of absolute file paths to scan
 */
export async function detectLanguagesFromFiles(
  filePaths: string[]
): Promise<BundledLanguage[]> {
  const detectedLangs = new Set<string>();

  // Regex to match code fence language identifiers: ```lang or ```lang{...}
  const codeFenceRegex = /^```(\w+)/gm;

  await Promise.all(
    filePaths.map(async (file) => {
      const content = await Bun.file(file).text();
      let match;
      while ((match = codeFenceRegex.exec(content)) !== null) {
        const lang = match[1]!.toLowerCase();
        if (VALID_LANGUAGES.has(lang)) {
          detectedLangs.add(lang);
        }
      }
    })
  );

  const langs = Array.from(detectedLangs) as BundledLanguage[];
  if (langs.length > 0) {
    log.debug(`Detected ${langs.length} code languages: ${langs.join(', ')}`);
  }
  return langs;
}

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

  // Dispose old highlighter if languages changed
  if (cachedHighlighter) {
    cachedHighlighter.dispose();
    cachedHighlighter = null;
  }

  // Create new highlighter with detected languages
  const t0 = performance.now();
  const langsToLoad = langs.length > 0 ? langs : ['plaintext' as BundledLanguage];
  cachedHighlighterLangs = langsKey;

  highlighterPromise = createHighlighter({
    themes: ['github-light'],
    langs: langsToLoad,
  }).then((h) => {
    cachedHighlighter = h;
    log.debug(
      `Shiki highlighter created in ${(performance.now() - t0).toFixed(0)}ms (${langsToLoad.length} languages)`
    );
    return h;
  });

  return highlighterPromise;
}

/**
 * Get the languages to load based on highlight mode.
 * For 'auto' mode, uses entries from context to avoid duplicate glob searches.
 */
export async function getLanguagesForMode(
  ctx: BuildContext,
  mode: HighlightMode
): Promise<BundledLanguage[]> {
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
        const filePaths = Object.values(entries).map((entry) => entry.absPath);
        detectedLanguagesPromise = detectLanguagesFromFiles(filePaths);
        detectedLanguagesCache = await detectedLanguagesPromise;
        return detectedLanguagesCache;
      }
  }
}

/**
 * Reset the shiki highlighter and language detection cache.
 * Called when files change in dev mode.
 */
export function resetShikiState(): void {
  detectedLanguagesCache = null;
  detectedLanguagesPromise = null;
  if (cachedHighlighter) {
    cachedHighlighter.dispose();
  }
  cachedHighlighter = null;
  cachedHighlighterLangs = null;
  highlighterPromise = null;
}

/**
 * Create the rehype shiki plugin for syntax highlighting.
 * Returns null if highlighting is disabled.
 */
export async function createShikiPlugin(
  ctx: BuildContext
): Promise<any[] | null> {
  const highlightMode = ctx.options.highlight || 'auto';

  if (highlightMode === 'off') {
    return null;
  }

  const langs = await getLanguagesForMode(ctx, highlightMode);
  const highlighter = await getShikiHighlighter(langs);

  return [rehypeShikiFromHighlighter, highlighter, { theme: 'github-light' }];
}
