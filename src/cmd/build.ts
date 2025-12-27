import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { getBuildContext } from '../context';
import { getBunBuildConfig, getServerBunBuildConfig, resetLanguageCache } from '../buncfg';
import { render, escapeHtml } from '../util';
import { getPreprocessingErrors, resetPreprocessingState } from '../preprocess';
import log from '../logger';

/**
 * Common MDX/JSX errors and their user-friendly explanations
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  getMessage: (match: RegExpMatchArray, filePath?: string) => string;
}> = [
  {
    pattern:
      /The `style` prop expects a mapping from style properties to values, not a string/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  HTML-style "style" attributes don't work in MDX.\n\n` +
      `  Instead of:  <div style="color: red">\n` +
      `  Use:         <div style={{color: 'red'}}>\n\n` +
      `  MDX uses JSX syntax, so style must be an object.`,
  },
  {
    pattern: /Invalid DOM property `class`\. Did you mean `className`\?/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  HTML-style "class" attributes don't work in MDX.\n\n` +
      `  Instead of:  <div class="foo">\n` +
      `  Use:         <div className="foo">\n\n` +
      `  MDX uses JSX syntax, so use className instead of class.`,
  },
  {
    pattern:
      /Element type is invalid: expected a string.*but got: (undefined|object)/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  A JSX element couldn't be rendered. Common causes:\n\n` +
      `  1. Unclosed HTML tag - use self-closing syntax:\n` +
      `     Instead of:  <img src="...">\n` +
      `     Use:         <img src="..." />\n\n` +
      `  2. Missing component - check the component name is correct\n` +
      `     and the file exists in src/ or pages/`,
  },
  {
    pattern: /Expected corresponding JSX closing tag for <(\w+)>/,
    getMessage: (match, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  Unclosed <${match[1]}> tag.\n\n` +
      `  Either close it: <${match[1]}>...</${match[1]}>\n` +
      `  Or self-close:   <${match[1]} />`,
  },
  {
    pattern: /Unexpected token/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  Invalid JSX syntax. Check for:\n` +
      `  - Unclosed tags (use <img /> not <img>)\n` +
      `  - HTML attributes (use className not class)\n` +
      `  - Style attributes (use style={{}} not style="")`,
  },
];

/**
 * Attempt to extract the source file path from an error
 */
function extractFilePath(error: Error | string): string | undefined {
  const errorStr =
    error instanceof Error ? error.stack || error.message : error;
  // Look for paths in server-compiled or client-compiled directories
  const match = errorStr.match(
    /(?:server-compiled|client-compiled)\/([^/]+)\/index\.js/
  );
  if (match) {
    return `pages/${match[1]}.mdx`;
  }
  return undefined;
}

/**
 * Transform build errors into more helpful messages
 */
function formatBuildError(error: Error | string): string {
  const errorStr = error instanceof Error ? error.message : error;
  const filePath = extractFilePath(error);

  for (const { pattern, getMessage } of ERROR_PATTERNS) {
    const match = errorStr.match(pattern);
    if (match) {
      return getMessage(match, filePath);
    }
  }

  // Return original error if no pattern matched
  return errorStr;
}

interface BuildOptions {
  ssg?: boolean;
  static?: 'public' | 'assets' | 'all';
}

/**
 * Build the project using Bun.build()
 */
export async function buildCommand(options: BuildOptions = {}, projectPath?: string) {
  try {
    await doBuild(options, projectPath);
  } catch (error) {
    // Format the error message to be more helpful
    const formatted = formatBuildError(error as Error);
    throw new Error(formatted);
  }
}

async function doBuild(options: BuildOptions = {}, projectPath?: string) {
  const ctx = getBuildContext();
  const { ssg = false, static: staticMode = 'assets' } = options;

  // Timing helper
  const timings: Record<string, number> = {};
  const time = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const result = await fn();
    timings[name] = performance.now() - start;
    return result;
  };

  // Reset state from any previous builds
  resetPreprocessingState();
  resetLanguageCache();
  renderedContent.clear();

  // Step 1: Ensure build dependencies are installed
  // Note: This may restart the build in a subprocess if deps need to be installed,
  // so we print the "Building" message AFTER this step to avoid duplicate output.
  await time('1. Dependencies', () => ctx.ensureBuildDependencies());

  log.info('Building Scratch project in', projectPath || '.');
  log.debug(`Building with Bun${ssg ? ' (SSG)' : ''}...`);

  // Step 2: Reset directories (preserves node_modules)
  await time('2. Reset dirs', () => ctx.reset());

  // Step 3: Create TypeScript entry files for each MDX page
  log.debug('=== TSX ENTRY FILES ===');
  const entries = await ctx.getEntries();
  if (Object.keys(entries).length === 0) {
    throw new Error(
      `No pages found. Create MDX files in the pages/ directory.\n\n` +
        `Example:\n` +
        `  mkdir -p pages\n` +
        `  echo "# Hello World" > pages/index.mdx\n\n` +
        `Then run 'scratch build' again.`
    );
  }

  // Create client TSX entry files
  const tsxEntryPts = await time('3. TSX entries', async () => createEntries({
    extension: '.tsx',
    outDir: ctx.clientSrcDir,
    templatePath: await ctx.clientTsxSrcPath(),
  }));

  // Create server JSX entry files if SSG is enabled
  let serverEntryPts: Record<string, string> | null = null;
  if (ssg) {
    serverEntryPts = await time('3b. Server entries', async () => createEntries({
      extension: '.jsx',
      outDir: ctx.serverSrcDir,
      templatePath: await ctx.serverJsxSrcPath(),
    }));
  }

  // Step 4: Build Tailwind CSS (runs in parallel with Bun builds)
  // Step 5-6: Run server and client Bun.build()
  log.debug('=== BUILDS ===');

  // Prepare build configs upfront (this initializes shiki highlighter once)
  const [clientBuildConfig, serverBuildConfig] = await Promise.all([
    getBunBuildConfig({
      entryPts: Object.values(tsxEntryPts),
      outDir: ctx.clientCompiledDir,
      root: ctx.clientSrcDir,
    }),
    ssg && serverEntryPts
      ? getServerBunBuildConfig({
          entryPts: Object.values(serverEntryPts),
          outDir: ctx.serverCompiledDir,
          root: ctx.serverSrcDir,
        })
      : Promise.resolve(null),
  ]);

  // Run Tailwind in parallel with server build, then client build
  // (Running all three in parallel causes resource contention and slows down client build)
  const [cssFilename, serverBuildResult] = await Promise.all([
    time('4. Tailwind CSS', () => buildTailwindCss()),
    ssg && serverBuildConfig
      ? time('5. Server Bun.build', async () => {
          try {
            return await Bun.build(serverBuildConfig);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Server bundle failed: ${errorMessage}`);
          }
        })
      : Promise.resolve(null),
  ]);

  // Client build runs after server to avoid resource contention
  const clientBuildResult = await time('6. Client Bun.build', async () => {
    try {
      return await Bun.build(clientBuildConfig);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Client bundle failed: ${errorMessage}`);
    }
  });

  // Check server build result
  if (ssg && serverBuildResult) {
    if (!serverBuildResult.success) {
      const errorMessages = serverBuildResult.logs.map(msg => String(msg)).join('\n');
      throw new Error(`Server build failed:\n${errorMessages}`);
    }
    log.debug(`Built ${serverBuildResult.outputs.length} server modules`);

    // Check for server preprocessing errors
    const serverPreprocessErrors = getPreprocessingErrors();
    if (serverPreprocessErrors.length > 0) {
      for (const err of serverPreprocessErrors) {
        log.error(err.message);
      }
      throw new Error('MDX preprocessing failed');
    }
  }

  // Check client build result
  const result = clientBuildResult;
  if (!result.success) {
    const errorMessages = result.logs.map(msg => String(msg)).join('\n');
    throw new Error(`Client build failed:\n${errorMessages}`);
  }

  // Check for client preprocessing errors
  const clientPreprocessErrors = getPreprocessingErrors();
  if (clientPreprocessErrors.length > 0) {
    for (const err of clientPreprocessErrors) {
      log.error(err.message);
    }
    throw new Error('MDX preprocessing failed');
  }

  log.debug(`Built ${result.outputs.length} client bundles`);

  // Step 5b: Render server modules (if SSG) - must happen after server build
  if (ssg && serverBuildResult) {
    await time('5b. Server render', () => renderServerModules());
  }

  // Build map from entry name to hashed JS output path
  // Use the source TSX paths to match outputs to entries
  const jsOutputMap: Record<string, string> = {};

  // Build reverse map: relative base path (without extension) -> entry name
  // e.g., "index" -> "index", "examples/index" -> "examples/index"
  const basePathToEntry: Record<string, string> = {};
  for (const [entryName, tsxPath] of Object.entries(tsxEntryPts)) {
    const relativeTsx = path.relative(ctx.clientSrcDir, tsxPath);
    const basePath = relativeTsx.replace(/\.tsx$/, '');
    basePathToEntry[basePath] = entryName;
  }

  for (const output of result.outputs) {
    log.debug(`  ${path.relative(ctx.rootDir, output.path)}`);

    // Only process JS entry files (not chunks)
    if (output.kind === 'entry-point' && output.path.endsWith('.js')) {
      // Get relative path and strip hash to get base path
      // e.g., "examples/index-abc123.js" -> "examples/index"
      const relativePath = path.relative(ctx.clientCompiledDir, output.path);
      const dir = path.dirname(relativePath);
      const basename = path.basename(relativePath, '.js');
      const nameWithoutHash = basename.replace(/-[a-z0-9]+$/, '');

      const basePath = dir === '.' ? nameWithoutHash : path.join(dir, nameWithoutHash);
      const entryName = basePathToEntry[basePath];

      if (entryName) {
        jsOutputMap[entryName] = output.path;
      }
    }
  }

  // Step 7: Create HTML files with proper script references
  log.debug('=== HTML GENERATION ===');
  await time('7. HTML generation', () => createHtmlEntries(ssg, cssFilename, jsOutputMap));

  // Step 8: Inject frontmatter meta tags into HTML files
  log.debug('=== FRONTMATTER INJECTION ===');
  await time('8. Frontmatter', () => injectFrontmatterMeta());

  // Step 9: Copy pages/ as static assets (lowest priority - gets overwritten by public/ and compiled)
  if (staticMode !== 'public') {
    log.debug('=== PAGES STATIC ASSETS ===');
    const buildFileExts = ['.md', '.mdx', '.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs'];
    await time('9. Pages static', async () => {
      // Resolve symlinks to avoid fs.cp issues when pagesDir is a symlink (e.g., in view mode)
      const realPagesDir = await fs.realpath(ctx.pagesDir);
      await fs.cp(realPagesDir, ctx.buildDir, {
        recursive: true,
        filter: (src) => {
          if (staticMode === 'all') return true;
          // 'assets' mode: skip build files
          return !buildFileExts.some(ext => src.endsWith(ext));
        }
      });
    });
  }

  // Step 10: Copy static assets from public directory (middle priority)
  if (await fs.exists(ctx.staticDir)) {
    log.debug('=== PUBLIC STATIC ASSETS ===');
    await time('10. Public static', async () => {
      await fs.cp(ctx.staticDir, ctx.buildDir, { recursive: true });
      const files = await fs.readdir(ctx.staticDir);
      for (const file of files) {
        log.debug(`  ${file}`);
      }
    });
  }

  // Step 11: Copy compiled assets to build directory (highest priority)
  await time('11. Copy compiled to dist', () => fs.cp(ctx.clientCompiledDir, ctx.buildDir, { recursive: true }));

  log.debug(`Output in: ${ctx.buildDir}`);

  // Print timing breakdown
  log.debug('=== TIMING BREAKDOWN ===');
  for (const [name, ms] of Object.entries(timings)) {
    log.debug(`  ${name}: ${ms.toFixed(0)}ms`);
  }
}

interface CreateEntriesOptions {
  extension: '.tsx' | '.jsx';
  outDir: string;
  templatePath: string;
}

/**
 * Create entry files from a template for each MDX page.
 * Used for both client (.tsx) and server (.jsx) entries.
 */
async function createEntries(options: CreateEntriesOptions): Promise<Record<string, string>> {
  const { extension, outDir, templatePath } = options;
  const ctx = getBuildContext();
  const entries = await ctx.getEntries();
  const entryPts: Record<string, string> = {};

  for (const [name, entry] of Object.entries(entries)) {
    const artifactPath = entry.getArtifactPath(extension, outDir);

    await render(
      templatePath,
      artifactPath,
      {},
      {
        entrySourceMdxImportPath: entry.absPath,
        markdownComponentsPath: await ctx.markdownComponentsDir(),
      }
    );

    entryPts[name] = artifactPath;
    log.debug(`  ${path.relative(ctx.rootDir, artifactPath)}`);
  }

  return entryPts;
}

/**
 * Build Tailwind CSS using Tailwind CLI
 */
async function buildTailwindCss() {
  const ctx = getBuildContext();
  const inputCss = await ctx.tailwindCssSrcPath();
  const outputCss = path.join(ctx.clientCompiledDir, 'tailwind.css');
  const nodeModulesDir = await ctx.nodeModulesDir();

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputCss), { recursive: true });

  // Read the input CSS and prepend @source directives for template src
  // This ensures Tailwind scans the template directory for classes used in fallback components
  let cssContent = await fs.readFile(inputCss, 'utf-8');

  // Add @source directive for embedded template src (after @import "tailwindcss" if present)
  // The embedded templates are materialized to the temp directory during the build
  const embeddedSrcDir = path.resolve(ctx.embeddedTemplatesDir, 'src');
  const sourceDirective = `@source "${embeddedSrcDir}";\n`;

  // Insert after @import "tailwindcss" or at the beginning
  if (cssContent.includes('@import "tailwindcss"')) {
    cssContent = cssContent.replace(
      '@import "tailwindcss";',
      `@import "tailwindcss";\n${sourceDirective}`
    );
  } else {
    cssContent = sourceDirective + cssContent;
  }

  // Write the modified CSS to cache directory
  const cacheInputCss = path.join(ctx.tempDir, 'tailwind-input.css');
  await fs.writeFile(cacheInputCss, cssContent);

  // Build Tailwind CSS (v4 auto-detects content from cwd)
  const args = ['-i', cacheInputCss, '-o', outputCss];
  if (!ctx.options.development) {
    args.push('--minify');
  }

  // Use tailwindcss from resolved node_modules
  const tailwindBin = path.resolve(nodeModulesDir, '.bin/tailwindcss');

  const proc = Bun.spawn([tailwindBin, ...args], {
    cwd: ctx.rootDir, // Tailwind v4 auto-detects content from cwd
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Tailwind CSS build failed: ${stderr}`);
  }

  // Hash the CSS content and rename file for cache busting
  const builtCssContent = await fs.readFile(outputCss);
  const hash = createHash('md5').update(builtCssContent).digest('hex').slice(0, 8);
  const hashedFilename = `tailwind-${hash}.css`;
  const hashedOutputCss = path.join(ctx.clientCompiledDir, hashedFilename);
  await fs.rename(outputCss, hashedOutputCss);

  return hashedFilename;
}

// Store rendered HTML content for SSG (keyed by entry name)
const renderedContent = new Map<string, string>();

/**
 * Render server modules to HTML for SSG (called after server Bun.build completes)
 */
async function renderServerModules() {
  const ctx = getBuildContext();
  const entries = await ctx.getEntries();

  log.debug(`Rendering ${Object.keys(entries).length} pages...`);

  // Import each server module and call render() - in parallel for performance
  const renderPromises = Object.entries(entries).map(async ([name, entry]) => {
    const modulePath = entry.getArtifactPath('.js', ctx.serverCompiledDir);
    const serverModule = await import(modulePath);
    const html = await serverModule.render();
    renderedContent.set(name, html);
  });

  await Promise.all(renderPromises);
}

/**
 * Detect favicons in the public directory and return appropriate link tags
 */
async function getFaviconLinkTags(): Promise<string> {
  const ctx = getBuildContext();
  const links: string[] = [];

  // Check for SVG favicon (preferred for modern browsers)
  const svgFaviconPath = path.join(ctx.staticDir, 'favicon.svg');
  if (await fs.exists(svgFaviconPath)) {
    links.push('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  }

  // Check for ICO favicon (fallback for older browsers)
  const icoFaviconPath = path.join(ctx.staticDir, 'favicon.ico');
  if (await fs.exists(icoFaviconPath)) {
    links.push('<link rel="icon" href="/favicon.ico" />');
  }

  return links.join('\n    ');
}

/**
 * Create HTML entry files that reference the compiled JS bundles
 */
async function createHtmlEntries(ssg: boolean = false, cssFilename: string, jsOutputMap: Record<string, string>) {
  const ctx = getBuildContext();
  const entries = await ctx.getEntries();

  // Detect favicons once for all entries
  const faviconLinks = await getFaviconLinkTags();

  // Build HTML for each entry
  const ssgFlagScript =
    '<script rel="modulepreload" type="module">window.__scratch_ssg = true;</script>';

  for (const [name, entry] of Object.entries(entries)) {
    const htmlPath = entry.getArtifactPath('.html', ctx.clientCompiledDir);

    // Look up the actual hashed JS path from the build output
    const jsPath = jsOutputMap[name];
    if (!jsPath) {
      throw new Error(`No JS output found for entry: ${name}`);
    }

    // Calculate relative path from HTML to JS
    const relativeJsPath = '/' + path.relative(ctx.clientCompiledDir, jsPath);

    // Get SSG content if available
    const ssgContent =
      ssg && renderedContent.has(name) ? renderedContent.get(name)! : '';

    // Build HTML directly (avoids issues with empty template variables)
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/${cssFilename}" />
    ${faviconLinks}
    ${ssg ? ssgFlagScript : ''}
  </head>
  <body>
    <div id="mdx">${ssgContent}</div>
    <script type="module" src="${relativeJsPath}"></script>
  </body>
</html>`;

    await fs.mkdir(path.dirname(htmlPath), { recursive: true });
    await fs.writeFile(htmlPath, html);
    log.debug(`  ${path.relative(ctx.rootDir, htmlPath)}`);
  }
}

/**
 * Inject frontmatter meta tags into generated HTML files.
 */
async function injectFrontmatterMeta() {
  const ctx = getBuildContext();
  const entries = await ctx.getEntries();
  let injectedCount = 0;

  for (const [name, entry] of Object.entries(entries)) {
    if (
      !entry.frontmatterData ||
      Object.keys(entry.frontmatterData).length === 0
    ) {
      continue;
    }

    const htmlPath = entry.getArtifactPath('.html', ctx.clientCompiledDir);
    let html = await fs.readFile(htmlPath, 'utf-8');

    const metadata = entry.frontmatterData;

    // Helper to safely escape metadata values
    const e = (val: unknown): string => escapeHtml(String(val));

    // Build meta tags (escape all user-provided values to prevent XSS)
    let metaTags = [
      metadata.title && `<title>${e(metadata.title)}</title>`,
      metadata.description &&
        `<meta name="description" content="${e(metadata.description)}">`,
      metadata.keywords &&
        `<meta name="keywords" content="${e(Array.isArray(metadata.keywords) ? metadata.keywords.join(', ') : metadata.keywords)}">`,
      metadata.author && `<meta name="author" content="${e(metadata.author)}">`,
      metadata.robots && `<meta name="robots" content="${e(metadata.robots)}">`,

      // Open Graph
      metadata.title &&
        `<meta property="og:title" content="${e(metadata.title)}">`,
      metadata.description &&
        `<meta property="og:description" content="${e(metadata.description)}">`,
      metadata.image &&
        `<meta property="og:image" content="${e(metadata.image)}">`,
      metadata.url && `<meta property="og:url" content="${e(metadata.url)}">`,
      `<meta property="og:type" content="${e(metadata.type || 'article')}">`,

      // Twitter
      metadata.title &&
        `<meta name="twitter:title" content="${e(metadata.title)}">`,
      metadata.description &&
        `<meta name="twitter:description" content="${e(metadata.description)}">`,
      metadata.image &&
        `<meta name="twitter:image" content="${e(metadata.image)}">`,
      `<meta name="twitter:card" content="${e(metadata.twitterCard || 'summary_large_image')}">`,

      // Dates
      metadata.publishDate &&
        `<meta property="article:published_time" content="${e(metadata.publishDate)}">`,
      metadata.modifiedDate &&
        `<meta property="article:modified_time" content="${e(metadata.modifiedDate)}">`,

      // Canonical
      metadata.canonical &&
        `<link rel="canonical" href="${e(metadata.canonical)}">`,
    ]
      .filter(Boolean)
      .join('\n    ');

    // Handle tags separately (multiple meta tags)
    if (metadata.tags) {
      const tagMetas = (
        Array.isArray(metadata.tags) ? metadata.tags : [metadata.tags]
      )
        .map((tag: string) => `<meta property="article:tag" content="${e(tag)}">`)
        .join('\n    ');
      metaTags += '\n    ' + tagMetas;
    }

    // Insert before closing </head>
    html = html.replace('</head>', `    ${metaTags}\n  </head>`);

    // Update lang attribute if specified
    if (metadata.lang) {
      html = html.replace('<html lang="en">', `<html lang="${e(metadata.lang)}">`);
    }

    await fs.writeFile(htmlPath, html);
    injectedCount++;
  }

  if (injectedCount > 0) {
    log.debug(
      `Injected frontmatter meta tags into ${injectedCount} HTML files`
    );
  }
}
