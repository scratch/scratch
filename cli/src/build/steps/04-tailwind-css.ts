import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import type { BuildContext } from '../context';
import type { BuildPipelineState } from '../types';
import type { BuildStep } from '../types';
import { spawnBunSync } from '../../util';
import log from '../../logger';

export const tailwindCssStep: BuildStep = {
  name: '04-tailwind-css',
  description: 'Build Tailwind CSS',

  async execute(ctx: BuildContext, state: BuildPipelineState): Promise<void> {
    const inputCss = await ctx.tailwindCssSrcPath();

    // If no CSS file found, skip Tailwind build
    if (!inputCss) {
      log.info('No Tailwind CSS file found (src/tailwind.css, src/index.css, or src/globals.css).');
      log.info('Skipping CSS build. Run `scratch checkout src/tailwind.css` to create one.');
      state.outputs.cssFilename = null;
      return;
    }

    const outputCss = path.join(ctx.clientCompiledDir, 'tailwind.css');
    const nodeModulesDir = ctx.nodeModulesDir;

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputCss), { recursive: true });

    // Resolve the actual JS entry point for tailwindcss rather than the .bin
    // shebang wrapper (which uses #!/usr/bin/env node and may hit an old Node).
    const tailwindBinLink = path.resolve(nodeModulesDir, '.bin/tailwindcss');
    const tailwindBin = await fs.realpath(tailwindBinLink);

    const args = [tailwindBin, '-i', inputCss, '-o', outputCss];
    if (!ctx.options.development) {
      args.push('--minify');
    }

    log.debug(`  Running: ${args.join(' ')}`);
    log.debug(`  Output: ${outputCss}`);

    const result = spawnBunSync(args, { cwd: ctx.rootDir });

    if (result.exitCode !== 0) {
      throw new Error(`Tailwind CSS build failed: ${result.stderr || result.stdout}`);
    }

    // Hash the CSS content and rename file for cache busting
    const builtCssContent = await fs.readFile(outputCss);
    const hash = createHash('md5').update(builtCssContent).digest('hex').slice(0, 8);
    const hashedFilename = `tailwind-${hash}.css`;
    const hashedOutputCss = path.join(ctx.clientCompiledDir, hashedFilename);
    await fs.rename(outputCss, hashedOutputCss);

    log.debug(`  Built ${hashedFilename}`);

    state.outputs.cssFilename = hashedFilename;
  },
};
