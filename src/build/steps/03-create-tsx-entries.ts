import path from 'path';
import type { BuildContext, Entry } from '../context';
import type { BuildPipelineState } from '../types';
import type { BuildStep } from '../types';
import { render } from '../../util';
import log from '../../logger';

interface CreateEntriesOptions {
  extension: '.tsx' | '.jsx';
  outDir: string;
  templatePath: string;
}

interface CreateEntriesContext {
  ctx: BuildContext;
  entries: Record<string, Entry>;
  markdownComponentsPath: string;
}

async function createEntries(
  context: CreateEntriesContext,
  options: CreateEntriesOptions
): Promise<Record<string, string>> {
  const { ctx, entries, markdownComponentsPath } = context;
  const { extension, outDir, templatePath } = options;
  const entryPts: Record<string, string> = {};

  for (const [name, entry] of Object.entries(entries)) {
    const artifactPath = entry.getArtifactPath(extension, outDir);

    await render(templatePath, artifactPath, {}, {
      entrySourceMdxImportPath: entry.absPath,
      markdownComponentsPath: markdownComponentsPath,
    });

    entryPts[name] = artifactPath;
    log.debug(`  ${path.relative(ctx.rootDir, artifactPath)}`);
  }

  return entryPts;
}

export const createTsxEntriesStep: BuildStep = {
  name: '03-create-tsx-entries',
  description: 'Create TSX/JSX entry files from MDX pages',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
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

    // Check for markdown components directory, fall back to empty components
    let markdownComponentsPath = await ctx.markdownComponentsDir();
    if (!markdownComponentsPath) {
      log.info('No markdown components found in src/. Using defaults.');
      log.info('Run `scratch checkout src/markdown` to create custom components.');
      markdownComponentsPath = await ctx.emptyMdxComponentsPath();
    }

    // Check for PageWrapper component
    const pageWrapperPath = await ctx.pageWrapperPath();
    if (!pageWrapperPath) {
      log.info('No PageWrapper component found in src/. Pages will not be wrapped.');
      log.info('Run `scratch checkout src/PageWrapper.jsx` to create one.');
    }

    const createEntriesContext: CreateEntriesContext = {
      ctx,
      entries,
      markdownComponentsPath,
    };

    // Create client TSX entry files (template falls back to embedded if not in project)
    const clientEntryPts = await createEntries(createEntriesContext, {
      extension: '.tsx',
      outDir: ctx.clientSrcDir,
      templatePath: await ctx.clientTsxSrcPath(),
    });

    // Create server JSX entry files if SSG is enabled
    let serverEntryPts: Record<string, string> | null = null;
    if (state.options.ssg) {
      serverEntryPts = await createEntries(createEntriesContext, {
        extension: '.jsx',
        outDir: ctx.serverSrcDir,
        templatePath: await ctx.serverJsxSrcPath(),
      });
    }

    // Store outputs
    state.outputs.entries = entries;
    state.outputs.clientEntryPts = clientEntryPts;
    state.outputs.serverEntryPts = serverEntryPts;
  },
};
