import fs from 'fs/promises';
import path from 'path';
import type { BuildContext } from '../context';
import type { BuildPipelineState, BuildStep } from '../types';
import { normalizeBase } from '../util';
import { buildGlobals, generateGlobalsScript } from '../globals';
import log from '../../logger';

export const generateHtmlStep: BuildStep = {
  name: '07-generate-html',
  description: 'Generate HTML files',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const entries = state.outputs.entries!;
    const cssFilename = state.outputs.cssFilename;
    const jsOutputMap = state.outputs.jsOutputMap!;
    const ssg = state.options.ssg ?? false;
    const renderedContent = state.outputs.renderedContent ?? new Map();

    // Normalize base path for URL prefixing
    const base = normalizeBase(ctx.options.base);

    // Detect favicons once for all entries
    const faviconLinks = await getFaviconLinkTags(ctx, base);

    // Build CSS link tag (only if CSS was built)
    const cssLinkTag = cssFilename
      ? `<link rel="stylesheet" href="${base}/${cssFilename}" />`
      : '';

    // Build globals script for client-side access (base path, SSG flag, etc.)
    const globals = buildGlobals({ base, ssg });
    const globalsScript = generateGlobalsScript(globals);

    for (const [name, entry] of Object.entries(entries)) {
      const htmlPath = entry.getArtifactPath('.html', ctx.clientCompiledDir);

      // Look up the actual hashed JS path from the build output
      const jsPath = jsOutputMap[name];
      if (!jsPath) {
        throw new Error(`No JS output found for entry: ${name}`);
      }

      // Calculate relative path from HTML to JS (with base path prefix)
      const relativeJsPath =
        base + '/' + path.relative(ctx.clientCompiledDir, jsPath);

      // Get SSG content if available
      const ssgContent =
        ssg && renderedContent.has(name) ? renderedContent.get(name)! : '';

      // Build HTML
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${cssLinkTag}
    ${faviconLinks}
    ${globalsScript}
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
  },
};

/**
 * Detect favicons in the public directory and return appropriate link tags
 */
async function getFaviconLinkTags(
  ctx: BuildContext,
  base: string
): Promise<string> {
  const links: string[] = [];

  // Check for SVG favicon (preferred for modern browsers)
  const svgFaviconPath = path.join(ctx.staticDir, 'favicon.svg');
  if (await fs.exists(svgFaviconPath)) {
    links.push(
      `<link rel="icon" type="image/svg+xml" href="${base}/favicon.svg" />`
    );
  }

  // Check for ICO favicon (fallback for older browsers)
  const icoFaviconPath = path.join(ctx.staticDir, 'favicon.ico');
  if (await fs.exists(icoFaviconPath)) {
    links.push(`<link rel="icon" href="${base}/favicon.ico" />`);
  }

  return links.join('\n    ');
}
