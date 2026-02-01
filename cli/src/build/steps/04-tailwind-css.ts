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
    const nodeModulesDir = ctx.nodeModulesDir;

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputCss), { recursive: true });

    // Build Tailwind CSS (v4 auto-detects content from cwd)
    const args = ['-i', inputCss, '-o', outputCss];
    if (!ctx.options.development) {
      args.push('--minify');
    }

    // Use tailwindcss from resolved node_modules
    const tailwindBin = path.resolve(nodeModulesDir, '.bin/tailwindcss');

    log.debug(`  Running: ${tailwindBin} ${args.join(' ')}`);
    log.debug(`  Output: ${outputCss}`);

    const proc = Bun.spawn([tailwindBin, ...args], {
      cwd: ctx.rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Consume both stdout and stderr to prevent blocking
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    if (exitCode !== 0) {
      throw new Error(`Tailwind CSS build failed: ${stderr || stdout}`);
    }

    // Verify the output file was created (with brief retry for filesystem flush)
    let fileExists = await fs.exists(outputCss);
    if (!fileExists) {
      // Brief delay and retry in case of filesystem flush delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      fileExists = await fs.exists(outputCss);
    }
    if (!fileExists) {
      // Check if the directory exists and what's in it
      const dirPath = path.dirname(outputCss);
      const dirExists = await fs.exists(dirPath);
      let dirContents = '(dir does not exist)';
      if (dirExists) {
        try {
          const files = await fs.readdir(dirPath);
          dirContents = files.length > 0 ? files.join(', ') : '(empty)';
        } catch {
          dirContents = '(could not read)';
        }
      }
      throw new Error(
        `Tailwind CSS build completed but output file was not created.\n` +
          `Expected: ${outputCss}\n` +
          `Directory exists: ${dirExists}\n` +
          `Directory contents: ${dirContents}\n` +
          `Command: ${tailwindBin} ${args.join(' ')}\n` +
          (stderr ? `Tailwind stderr: ${stderr}\n` : '') +
          (stdout ? `Tailwind stdout: ${stdout}` : '')
      );
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
