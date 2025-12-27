import path from 'path';
import type { BuildContext, Entry } from '../context';
import type { BuildPipelineState, TsxEntriesOutput } from '../types';
import { BuildPhase, defineStep } from '../types';
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
  markdownComponentsDir: string | null;
}

async function createEntries(
  context: CreateEntriesContext,
  options: CreateEntriesOptions
): Promise<Record<string, string>> {
  const { ctx, entries, markdownComponentsDir } = context;
  const { extension, outDir, templatePath } = options;
  const entryPts: Record<string, string> = {};

  for (const [name, entry] of Object.entries(entries)) {
    const artifactPath = entry.getArtifactPath(extension, outDir);

    await render(
      templatePath,
      artifactPath,
      {},
      {
        entrySourceMdxImportPath: entry.absPath,
        markdownComponentsPath: markdownComponentsDir,
      }
    );

    entryPts[name] = artifactPath;
    log.debug(`  ${path.relative(ctx.rootDir, artifactPath)}`);
  }

  return entryPts;
}

export const createTsxEntriesStep = defineStep<TsxEntriesOutput>({
  name: '03-create-tsx-entries',
  description: 'Create TSX/JSX entry files from MDX pages',
  phase: BuildPhase.CreateTsxEntries,

  shouldRun(): boolean {
    return true;
  },

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<TsxEntriesOutput> {
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

    // Check for markdown components directory (optional)
    const markdownComponentsDir = await ctx.markdownComponentsDir();
    if (!markdownComponentsDir) {
      log.warn('No src/markdown/ directory found. Markdown components will not be available.');
    }

    const createEntriesContext: CreateEntriesContext = {
      ctx,
      entries,
      markdownComponentsDir,
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

    return { entries, clientEntryPts, serverEntryPts };
  },
});
