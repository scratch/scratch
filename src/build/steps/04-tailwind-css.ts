import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import type { BuildContext } from '../context';
import type { TailwindOutput } from '../types';
import { BuildPhase, defineStep } from '../types';
import log from '../../logger';

export const tailwindCssStep = defineStep<TailwindOutput>({
  name: '04-tailwind-css',
  description: 'Build Tailwind CSS',
  phase: BuildPhase.TailwindCss,

  shouldRun(): boolean {
    return true;
  },

  async execute(ctx: BuildContext): Promise<TailwindOutput> {
    log.debug('=== TAILWIND CSS ===');

    const inputCss = await ctx.tailwindCssSrcPath();
    const outputCss = path.join(ctx.clientCompiledDir, 'tailwind.css');
    const nodeModulesDir = await ctx.nodeModulesDir();

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputCss), { recursive: true });

    // Read the input CSS and prepend @source directives for template src
    let cssContent = await fs.readFile(inputCss, 'utf-8');

    // Add @source directive for embedded template src
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

    return { cssFilename: hashedFilename };
  },
});
