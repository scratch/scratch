import path from 'path';
import { globSync } from 'fast-glob';
import type { BuildContext } from '../context';
import type { BuildPipelineState, BuildStep } from '../types';

// Extensions to exclude from pages/ static copying (executable code files)
const CODE_FILE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

/**
 * Conflict information for error messages
 */
export interface PathConflict {
  distPath: string;
  sources: string[];
}

export interface UrlConflict {
  urlPath: string;
  distPaths: string[];
}

export interface ConflictResult {
  pathConflicts: PathConflict[];
  urlConflicts: UrlConflict[];
}

/**
 * Compute the URL path that a dist file would serve.
 * Server routing:
 * - /foo/index.html → /foo
 * - /foo.html → /foo
 * - /foo.txt → /foo.txt (exact)
 */
export function computeUrlPath(distPath: string): string {
  // Normalize path separators
  const normalizedPath = distPath.replace(/\\/g, '/');

  // index.html → parent directory
  if (normalizedPath.endsWith('/index.html')) {
    const dir = normalizedPath.slice(0, -'/index.html'.length);
    return dir === '' ? '/' : '/' + dir;
  }

  // Root index.html
  if (normalizedPath === 'index.html') {
    return '/';
  }

  // .html → URL without extension
  if (normalizedPath.endsWith('.html')) {
    return '/' + normalizedPath.slice(0, -'.html'.length);
  }

  // Everything else is served at exact path
  return '/' + normalizedPath;
}

/**
 * Get the dist path for a static file from pages/ (with .mdx → .md rename)
 */
function getStaticCopyDistPath(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === '.mdx') {
    return relPath.slice(0, -4) + '.md';
  }
  return relPath;
}

/**
 * Compute HTML output path and entry name for an MD/MDX file.
 */
function computeMdxOutputPaths(relPath: string): { entryName: string; htmlPath: string; staticPath: string } {
  // Entry name is the relative path without extension
  const entryName = relPath.replace(/\.[^/.]+$/, '');
  const basename = path.basename(entryName);

  // HTML output path
  let htmlPath: string;
  if (basename === 'index') {
    htmlPath = entryName + '.html';
  } else {
    htmlPath = entryName + '/index.html';
  }

  // Static copy path (with .mdx → .md rename)
  const staticPath = getStaticCopyDistPath(relPath);

  return { entryName, htmlPath, staticPath };
}

/**
 * Detect path and URL conflicts in the build output.
 *
 * Pass 1: Source → Dist path conflicts
 * Pass 2: Dist → URL conflicts
 */
export function detectConflicts(
  pagesDir: string,
  staticDir: string
): ConflictResult {
  // Map from dist path (relative to buildDir) to source paths
  const distPathMap = new Map<string, string[]>();

  // Helper to add a mapping
  const addMapping = (distRelPath: string, source: string) => {
    const normalized = distRelPath.replace(/\\/g, '/');
    if (!distPathMap.has(normalized)) {
      distPathMap.set(normalized, []);
    }
    distPathMap.get(normalized)!.push(source);
  };

  // Scan pages/ directory directly for MD/MDX files to catch conflicts
  // that would be missed due to entry name collisions (foo.md + foo.mdx)
  const mdxFiles = globSync('**/*.{md,mdx}', {
    cwd: pagesDir,
    onlyFiles: true,
    ignore: ['**/node_modules/**'],
  });

  for (const relPath of mdxFiles) {
    const { htmlPath, staticPath } = computeMdxOutputPaths(relPath);
    addMapping(htmlPath, `pages/${relPath} (HTML)`);
    addMapping(staticPath, `pages/${relPath} (static copy)`);
  }

  // Process non-code static files from pages/
  const pagesStaticFiles = globSync('**/*', {
    cwd: pagesDir,
    onlyFiles: true,
    ignore: ['**/node_modules/**'],
  });

  for (const relPath of pagesStaticFiles) {
    const ext = path.extname(relPath).toLowerCase();

    // Skip code files
    if (CODE_FILE_EXTS.includes(ext)) {
      continue;
    }

    // Skip MD/MDX files (already processed above)
    if (ext === '.md' || ext === '.mdx') {
      continue;
    }

    // Other static files
    addMapping(relPath, `pages/${relPath}`);
  }

  // Process public/ files
  const publicFiles = globSync('**/*', {
    cwd: staticDir,
    onlyFiles: true,
    ignore: ['**/node_modules/**'],
  });

  for (const relPath of publicFiles) {
    addMapping(relPath, `public/${relPath}`);
  }

  // Pass 1: Find path conflicts
  const pathConflicts: PathConflict[] = [];
  for (const [distPath, sources] of distPathMap) {
    if (sources.length > 1) {
      pathConflicts.push({ distPath, sources });
    }
  }

  // Pass 2: Find URL conflicts
  const urlMap = new Map<string, string[]>();
  for (const distPath of distPathMap.keys()) {
    const urlPath = computeUrlPath(distPath);
    if (!urlMap.has(urlPath)) {
      urlMap.set(urlPath, []);
    }
    urlMap.get(urlPath)!.push(distPath);
  }

  const urlConflicts: UrlConflict[] = [];
  for (const [urlPath, distPaths] of urlMap) {
    if (distPaths.length > 1) {
      urlConflicts.push({ urlPath, distPaths });
    }
  }

  return { pathConflicts, urlConflicts };
}

/**
 * Format conflict errors for display
 */
export function formatConflictErrors(result: ConflictResult): string {
  const lines: string[] = ['Build failed: Path conflicts detected', ''];

  if (result.pathConflicts.length > 0) {
    for (const conflict of result.pathConflicts) {
      lines.push(`  dist/${conflict.distPath} is produced by multiple sources:`);
      for (const source of conflict.sources) {
        lines.push(`    - ${source}`);
      }
      lines.push('');
    }
  }

  if (result.urlConflicts.length > 0) {
    for (const conflict of result.urlConflicts) {
      lines.push(`  URL ${conflict.urlPath} is served by multiple files:`);
      for (const distPath of conflict.distPaths) {
        lines.push(`    - dist/${distPath}`);
      }
      lines.push('');
    }
  }

  lines.push('Remove or rename conflicting files to continue.');

  return lines.join('\n');
}

export const checkConflictsStep: BuildStep = {
  name: '02b-check-conflicts',
  description: 'Check for path conflicts',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const result = detectConflicts(ctx.pagesDir, ctx.staticDir);

    const hasConflicts = result.pathConflicts.length > 0 || result.urlConflicts.length > 0;

    if (hasConflicts) {
      throw new Error(formatConflictErrors(result));
    }
  },
};
