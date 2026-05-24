import fs from 'fs/promises';
import path from 'path';
import { BuildContext } from '../../build/context';
import { buildCommand } from '../build';
import { confirm, prompt } from '../../util';
import { DeployEnvironment, DeployOptions, ProviderDeployContext } from './types';

function defaultProjectName(rootDir: string): string {
  const base = path.basename(rootDir).trim();
  return base || 'scratch-site';
}

export function resolveEnvironment(options: DeployOptions): DeployEnvironment {
  if (options.prod && options.preview) {
    throw new Error('Choose either --prod or --preview, not both.');
  }
  return options.prod ? 'prod' : 'preview';
}

export function resolveRootDir(projectPath: string): string {
  return path.resolve(projectPath || '.');
}

export async function resolveProjectName(rootDir: string, options: DeployOptions): Promise<string> {
  if (options.project?.trim()) return options.project.trim();

  const fallback = defaultProjectName(rootDir);
  const nonInteractive = options.yes || options.json || !process.stdin.isTTY;
  if (nonInteractive) {
    return fallback;
  }

  return await prompt('Project name', fallback);
}

export async function maybeConfirmDeploy(options: DeployOptions, provider: string, project: string, environment: DeployEnvironment): Promise<void> {
  const nonInteractive = options.yes || options.json || !process.stdin.isTTY;
  if (nonInteractive) return;

  const approved = await confirm(
    `Deploy dist/ to ${provider} project "${project}" (${environment})?`,
    true
  );

  if (!approved) {
    throw new Error('Deploy cancelled by user.');
  }
}

export async function runBuildIfNeeded(rootDir: string, options: DeployOptions): Promise<void> {
  if (options.noBuild) return;

  // Use base: '' for external hosting providers (Vercel, Cloudflare Pages)
  // where sites are served from root. Users needing a custom base can
  // run `scratch build --base /path/` separately and deploy with --no-build.
  const buildCtx = new BuildContext({
    path: rootDir,
    base: '',
  });

  await buildCommand(buildCtx, { ssg: true }, rootDir);
}

export async function ensureDistDir(rootDir: string): Promise<string> {
  const distDir = path.join(rootDir, 'dist');

  try {
    const stat = await fs.stat(distDir);
    if (!stat.isDirectory()) {
      throw new Error('dist/ exists but is not a directory.');
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error('dist/ directory not found. Run `scratch build` first or omit --no-build.');
    }
    throw error;
  }

  return distDir;
}

export async function prepareDeploy(provider: string, projectPath: string, options: DeployOptions): Promise<ProviderDeployContext> {
  const rootDir = resolveRootDir(projectPath);
  const environment = resolveEnvironment(options);
  const project = await resolveProjectName(rootDir, options);

  if (!project) {
    throw new Error('Project name cannot be empty. Use --project <name>.');
  }

  await maybeConfirmDeploy(options, provider, project, environment);
  await runBuildIfNeeded(rootDir, options);

  const distDir = await ensureDistDir(rootDir);
  const nonInteractive = Boolean(options.yes || options.json || !process.stdin.isTTY);

  return {
    rootDir,
    distDir,
    environment,
    project,
    org: options.org,
    nonInteractive,
  };
}
