import { ensureAuthenticated, ensureToolAvailable } from '../utils/auth';
import { runCommand } from '../utils/spawn';
import { ensureHttpsUrl, pickDeployUrl } from '../utils/url';
import { DeployProvider, ProviderDeployContext } from '../types';

function buildScopeArgs(ctx: ProviderDeployContext): string[] {
  return ctx.org ? ['--scope', ctx.org] : [];
}

async function ensureProjectLinked(ctx: ProviderDeployContext): Promise<void> {
  const args = ['link', '--project', ctx.project, ...buildScopeArgs(ctx)];
  if (ctx.nonInteractive) {
    args.push('--yes');
  }
  await runCommand('vercel', args, { cwd: ctx.rootDir });
}

export const vercelProvider: DeployProvider = {
  name: 'vercel',
  description: 'Deploy dist/ to Vercel',

  async validatePrerequisites(): Promise<void> {
    await ensureToolAvailable('vercel', 'Install it with: npm i -g vercel');
    await ensureAuthenticated('vercel', ['whoami'], 'Run `vercel login` and try again.');
  },

  async deploy(ctx) {
    await ensureProjectLinked(ctx);

    const args = ['deploy', ctx.distDir, ...buildScopeArgs(ctx)];

    if (ctx.environment === 'prod') {
      args.push('--prod');
    }

    if (ctx.nonInteractive) {
      args.push('--yes');
    }

    const result = await runCommand('vercel', args, { cwd: ctx.rootDir });
    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const rawUrl = pickDeployUrl(combinedOutput, 'vercel');

    if (!rawUrl) {
      throw new Error('Vercel deploy succeeded but no deploy URL was detected in output.');
    }

    return {
      project: ctx.project,
      url: ensureHttpsUrl(rawUrl),
      rawOutput: combinedOutput,
    };
  },
};
