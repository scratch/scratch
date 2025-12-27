import fs from 'fs/promises';
import type { BuildContext } from '../context';
import type { BuildPipelineState, BuildStep } from '../types';
import { escapeHtml } from '../../util';
import log from '../../logger';

export const injectFrontmatterStep: BuildStep = {
  name: '08-inject-frontmatter',
  description: 'Inject frontmatter meta tags into HTML',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const entries = state.outputs.entries!;
    let injectedCount = 0;

    for (const [_name, entry] of Object.entries(entries)) {
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
        `  Injected frontmatter meta tags into ${injectedCount} HTML files`
      );
    }
  },
};
