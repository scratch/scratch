import { ensureAuthenticated, ensureToolAvailable } from '../utils/auth';
import { runCommand } from '../utils/spawn';
import { ensureHttpsUrl, pickDeployUrl } from '../utils/url';
import { DeployProvider, ProviderDeployContext } from '../types';

function buildAccountArgs(org?: string): string[] {
  return org ? ['--account-id', org] : [];
}

async function getGitBranch(rootDir: string): Promise<string | null> {
  const result = await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: rootDir,
    allowFailure: true,
  });

  if (result.exitCode !== 0) return null;
  const branch = result.stdout.trim();
  if (!branch || branch === 'HEAD') return null;
  return branch;
}

async function getCloudflareProductionBranch(ctx: ProviderDeployContext): Promise<string | null> {
  const result = await runCommand(
    'wrangler',
    ['pages', 'project', 'list', '--json', ...buildAccountArgs(ctx.org)],
    { cwd: ctx.rootDir, allowFailure: true }
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    const projects = JSON.parse(result.stdout) as Array<{ name?: string; production_branch?: string }>;
    const project = projects.find((entry) => entry.name === ctx.project);
    return project?.production_branch || null;
  } catch {
    return null;
  }
}

async function resolveDeployBranch(ctx: ProviderDeployContext): Promise<string> {
  if (ctx.environment === 'preview') {
    return (await getGitBranch(ctx.rootDir)) || 'preview';
  }

  return (await getCloudflareProductionBranch(ctx)) || 'main';
}

export const cloudflareProvider: DeployProvider = {
  name: 'cloudflare',
  description: 'Deploy dist/ to Cloudflare Pages',

  async validatePrerequisites(): Promise<void> {
    await ensureToolAvailable('wrangler', 'Install it with: npm i -g wrangler');
    await ensureAuthenticated('wrangler', ['whoami'], 'Run `wrangler login` and try again.');
  },

  async deploy(ctx) {
    const branch = await resolveDeployBranch(ctx);

    const args = [
      'pages',
      'deploy',
      ctx.distDir,
      '--project-name',
      ctx.project,
      '--branch',
      branch,
      ...buildAccountArgs(ctx.org),
    ];

    const result = await runCommand('wrangler', args, { cwd: ctx.rootDir });
    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const rawUrl = pickDeployUrl(combinedOutput, 'cloudflare');

    if (!rawUrl) {
      throw new Error('Cloudflare deploy succeeded but no deploy URL was detected in output.');
    }

    return {
      project: ctx.project,
      url: ensureHttpsUrl(rawUrl),
      rawOutput: combinedOutput,
    };
  },
};
