import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import type { BuildContext } from '../context';
import type { BuildPipelineState } from '../types';
import type { BuildStep } from '../types';
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
    const nodeModulesDir = await ctx.nodeModulesDir();

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputCss), { recursive: true });

    // Build Tailwind CSS (v4 auto-detects content from cwd)
    const args = ['-i', inputCss, '-o', outputCss];
    if (!ctx.options.development) {
      args.push('--minify');
    }

    // Use tailwindcss from resolved node_modules
    const tailwindBin = path.resolve(nodeModulesDir, '.bin/tailwindcss');

    const proc = Bun.spawn([tailwindBin, ...args], {
      cwd: ctx.rootDir,
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

    log.debug(`  Built ${hashedFilename}`);

    state.outputs.cssFilename = hashedFilename;
  },
};
