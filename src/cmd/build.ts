import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { getBuildContext } from '../context';
import { getBunBuildConfig, getServerBunBuildConfig } from '../buncfg';
import { render } from '../util';
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
}

/**
 * Build the project using Bun.build()
 */
export async function buildCommand(options: BuildOptions = {}) {
  try {
    await doBuild(options);
  } catch (error) {
    // Format the error message to be more helpful
    const formatted = formatBuildError(error as Error);
    throw new Error(formatted);
  }
}

async function doBuild(options: BuildOptions = {}) {
  const ctx = getBuildContext();
  const { ssg = false } = options;

  log.debug(`Building with Bun${ssg ? ' (SSG)' : ''}...`);

  // Timing helper
  const timings: Record<string, number> = {};
  const time = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const result = await fn();
    timings[name] = performance.now() - start;
    return result;
  };

  // Reset preprocessing state from any previous builds
  resetPreprocessingState();

  // Step 1: Ensure build dependencies are installed
  await time('1. Dependencies', () => ctx.ensureBuildDependencies());

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
  const tsxEntryPts = await time('3. TSX entries', () => createTsxEntries());

  // Step 4: Build Tailwind CSS separately
  log.debug('=== TAILWIND CSS ===');
  const cssFilename = await time('4. Tailwind CSS', () => buildTailwindCss());

  // Step 5 (SSG only): Build and render server modules
  if (ssg) {
    log.debug('=== SERVER BUILD (SSG) ===');
    await time('5. Server build', () => buildAndRenderServerModules());
  }

  // Step 6: Run Bun.build() on the TSX entry points (client build)
  const entryPaths = Object.values(tsxEntryPts);
  const buildConfig = await getBunBuildConfig({
    entryPts: entryPaths,
    outDir: ctx.clientCompiledDir(),
    root: ctx.clientSrcDir(),
  });

  log.debug('=== CLIENT BUILD ===');
  const result = await time('6. Client build', () => Bun.build(buildConfig));

  if (!result.success) {
    log.error('Build failed:');
    for (const buildLog of result.logs) {
      log.error(buildLog);
    }
    throw new Error('Bun build failed');
  }

  // Check for preprocessing errors (Bun.build swallows errors from remark plugins)
  const clientPreprocessErrors = getPreprocessingErrors();
  if (clientPreprocessErrors.length > 0) {
    for (const err of clientPreprocessErrors) {
      log.error(err.message);
    }
    throw new Error('MDX preprocessing failed');
  }

  log.debug(`Built ${result.outputs.length} client bundles:`);

  // Build map from entry name to hashed JS output path
  // Use the source TSX paths to match outputs to entries
  const jsOutputMap: Record<string, string> = {};

  // Build reverse map: relative base path (without extension) -> entry name
  // e.g., "index" -> "index", "examples/index" -> "examples/index"
  const basePathToEntry: Record<string, string> = {};
  for (const [entryName, tsxPath] of Object.entries(tsxEntryPts)) {
    const relativeTsx = path.relative(ctx.clientSrcDir(), tsxPath);
    const basePath = relativeTsx.replace(/\.tsx$/, '');
    basePathToEntry[basePath] = entryName;
  }

  for (const output of result.outputs) {
    log.debug(`  ${path.relative(ctx.rootDir, output.path)}`);

    // Only process JS entry files (not chunks)
    if (output.kind === 'entry-point' && output.path.endsWith('.js')) {
      // Get relative path and strip hash to get base path
      // e.g., "examples/index-abc123.js" -> "examples/index"
      const relativePath = path.relative(ctx.clientCompiledDir(), output.path);
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

  // Step 9: Copy to build directory
  await time('9. Copy to dist', () => fs.cp(ctx.clientCompiledDir(), ctx.buildDir, { recursive: true }));

  // Step 10: Copy static assets from public directory
  if (await fs.exists(ctx.staticDir)) {
    log.debug('=== STATIC ASSETS ===');
    await time('10. Static assets', async () => {
      await fs.cp(ctx.staticDir, ctx.buildDir, { recursive: true });
      const files = await fs.readdir(ctx.staticDir);
      for (const file of files) {
        log.debug(`  ${file}`);
      }
    });
  }

  log.debug(`Output in: ${ctx.buildDir}`);

  // Print timing breakdown
  log.debug('=== TIMING BREAKDOWN ===');
  for (const [name, ms] of Object.entries(timings)) {
    log.debug(`  ${name}: ${ms.toFixed(0)}ms`);
  }
}

/**
 * Create TSX entry files from template for each MDX page
 */
async function createTsxEntries(): Promise<Record<string, string>> {
  const ctx = getBuildContext();
  const entries = await ctx.getEntries();
  const tsxEntryPts: Record<string, string> = {};

  const tsxTemplatePath = await ctx.clientTsxSrcPath();

  for (const [name, entry] of Object.entries(entries)) {
    const artifactPath = entry.getArtifactPath('.tsx', ctx.clientSrcDir());

    await render(
      tsxTemplatePath,
      artifactPath,
      {},
      {
        entrySourceMdxImportPath: entry.absPath,
        markdownComponentsPath: await ctx.markdownComponentsDir(),
      }
    );

    tsxEntryPts[name] = artifactPath;
    log.debug(`  ${path.relative(ctx.rootDir, artifactPath)}`);
  }

  return tsxEntryPts;
}

/**
 * Build Tailwind CSS using Tailwind CLI
 */
async function buildTailwindCss() {
  const ctx = getBuildContext();
  const inputCss = await ctx.tailwindCssSrcPath();
  const outputCss = path.join(ctx.clientCompiledDir(), 'tailwind.css');
  const nodeModulesDir = await ctx.nodeModulesDir();

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputCss), { recursive: true });

  // Read the input CSS and prepend @source directives for template src
  // This ensures Tailwind scans the template directory for classes used in fallback components
  let cssContent = await fs.readFile(inputCss, 'utf-8');

  // Add @source directive for embedded template src (after @import "tailwindcss" if present)
  // The embedded templates are materialized to the temp directory during the build
  const embeddedSrcDir = path.resolve(ctx.embeddedTemplatesDir(), 'src');
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
  const hashedOutputCss = path.join(ctx.clientCompiledDir(), hashedFilename);
  await fs.rename(outputCss, hashedOutputCss);

  return hashedFilename;
}

// Store rendered HTML content for SSG (keyed by entry name)
const renderedContent = new Map<string, string>();

/**
 * Build server modules and render each page to HTML for SSG
 */
async function buildAndRenderServerModules() {
  const ctx = getBuildContext();

  // Create server entry files (JSX files that export render())
  log.debug('Creating server entry files:');
  const serverEntryPts = await createServerEntries();

  // Build server modules with Bun (target: bun for server-side execution)
  const buildConfig = await getServerBunBuildConfig({
    entryPts: Object.values(serverEntryPts),
    outDir: ctx.serverCompiledDir(),
    root: ctx.serverSrcDir(),
  });

  log.debug('Running Bun.build() for server...');
  const result = await Bun.build(buildConfig);

  if (!result.success) {
    log.error('Server build failed:');
    for (const buildLog of result.logs) {
      log.error(buildLog);
    }
    throw new Error('Bun server build failed');
  }

  // Check for preprocessing errors (Bun.build swallows errors from remark plugins)
  const serverPreprocessErrors = getPreprocessingErrors();
  if (serverPreprocessErrors.length > 0) {
    for (const err of serverPreprocessErrors) {
      log.error(err.message);
    }
    throw new Error('MDX preprocessing failed');
  }

  log.debug(`Built ${result.outputs.length} server modules:`);
  for (const output of result.outputs) {
    log.debug(`  ${path.relative(ctx.rootDir, output.path)}`);
  }

  // Import each server module and call render()
  const entries = await ctx.getEntries();
  log.debug(`Rendering ${Object.keys(entries).length} pages:`);
  for (const [name, entry] of Object.entries(entries)) {
    const modulePath = entry.getArtifactPath('.js', ctx.serverCompiledDir());

    // Import the compiled server module
    const serverModule = await import(modulePath);
    const html = await serverModule.render();

    // Store rendered content for later HTML injection
    renderedContent.set(name, html);
    log.debug(`  ${path.relative(ctx.rootDir, entry.absPath)}`);
  }
}

/**
 * Create server JSX entry files for SSG rendering
 */
async function createServerEntries(): Promise<Record<string, string>> {
  const ctx = getBuildContext();
  const entries = await ctx.getEntries();
  const serverEntryPts: Record<string, string> = {};

  const serverTemplatePath = await ctx.serverJsxSrcPath();

  for (const [name, entry] of Object.entries(entries)) {
    const artifactPath = entry.getArtifactPath('.jsx', ctx.serverSrcDir());

    await render(
      serverTemplatePath,
      artifactPath,
      {},
      {
        entrySourceMdxImportPath: entry.absPath,
        markdownComponentsPath: await ctx.markdownComponentsDir(),
      }
    );

    serverEntryPts[name] = artifactPath;
    log.debug(`  ${path.relative(ctx.rootDir, artifactPath)}`);
  }

  return serverEntryPts;
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
    const htmlPath = entry.getArtifactPath('.html', ctx.clientCompiledDir());

    // Look up the actual hashed JS path from the build output
    const jsPath = jsOutputMap[name];
    if (!jsPath) {
      throw new Error(`No JS output found for entry: ${name}`);
    }

    // Calculate relative path from HTML to JS
    const relativeJsPath = '/' + path.relative(ctx.clientCompiledDir(), jsPath);

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

    const htmlPath = entry.getArtifactPath('.html', ctx.clientCompiledDir());
    let html = await fs.readFile(htmlPath, 'utf-8');

    const metadata = entry.frontmatterData;

    // Build meta tags
    let metaTags = [
      metadata.title && `<title>${metadata.title}</title>`,
      metadata.description &&
        `<meta name="description" content="${metadata.description}">`,
      metadata.keywords &&
        `<meta name="keywords" content="${Array.isArray(metadata.keywords) ? metadata.keywords.join(', ') : metadata.keywords}">`,
      metadata.author && `<meta name="author" content="${metadata.author}">`,
      metadata.robots && `<meta name="robots" content="${metadata.robots}">`,

      // Open Graph
      metadata.title &&
        `<meta property="og:title" content="${metadata.title}">`,
      metadata.description &&
        `<meta property="og:description" content="${metadata.description}">`,
      metadata.image &&
        `<meta property="og:image" content="${metadata.image}">`,
      metadata.url && `<meta property="og:url" content="${metadata.url}">`,
      `<meta property="og:type" content="${metadata.type || 'article'}">`,

      // Twitter
      metadata.title &&
        `<meta name="twitter:title" content="${metadata.title}">`,
      metadata.description &&
        `<meta name="twitter:description" content="${metadata.description}">`,
      metadata.image &&
        `<meta name="twitter:image" content="${metadata.image}">`,
      `<meta name="twitter:card" content="${metadata.twitterCard || 'summary_large_image'}">`,

      // Dates
      metadata.publishDate &&
        `<meta property="article:published_time" content="${metadata.publishDate}">`,
      metadata.modifiedDate &&
        `<meta property="article:modified_time" content="${metadata.modifiedDate}">`,

      // Canonical
      metadata.canonical &&
        `<link rel="canonical" href="${metadata.canonical}">`,
    ]
      .filter(Boolean)
      .join('\n    ');

    // Handle tags separately (multiple meta tags)
    if (metadata.tags) {
      const tagMetas = (
        Array.isArray(metadata.tags) ? metadata.tags : [metadata.tags]
      )
        .map((tag: string) => `<meta property="article:tag" content="${tag}">`)
        .join('\n    ');
      metaTags += '\n    ' + tagMetas;
    }

    // Insert before closing </head>
    html = html.replace('</head>', `    ${metaTags}\n  </head>`);

    // Update lang attribute if specified
    if (metadata.lang) {
      html = html.replace('<html lang="en">', `<html lang="${metadata.lang}">`);
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
