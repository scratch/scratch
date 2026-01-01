// Deploy command: build and upload project to cloud

import fs from 'fs/promises';
import path from 'path';
import { globSync } from 'fast-glob';
import JSZip from 'jszip';
import { createApiClient } from '../../cloud/api';
import { requireAuth } from '../../cloud/credentials';
import { buildCommand } from '../build';
import { BuildContext } from '../../build/context';
import log from '../../logger';

/**
 * Create a zip buffer from a directory
 */
async function zipDirectory(dir: string): Promise<ArrayBuffer> {
  const files = globSync('**/*', { cwd: dir, onlyFiles: true });
  const zip = new JSZip();

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = await fs.readFile(filePath);
    zip.file(file, content);
  }

  const buffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  return buffer;
}

interface DeployOptions {
  project?: string;
}

/**
 * Deploy current project to cloud
 */
export async function deployCommand(
  projectPath: string = '.',
  options: DeployOptions = {}
): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const resolvedPath = path.resolve(projectPath);

  // Determine project slug
  let projectSlug = options.project;

  if (!projectSlug) {
    // Try to read from package.json
    try {
      const pkgPath = path.resolve(resolvedPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      projectSlug = pkg.name;
    } catch {
      throw new Error(
        'Could not determine project name. Use --project option or set name in package.json'
      );
    }
  }

  log.info(`Deploying to ${creds.user.org}/${projectSlug}...`);

  // Get project info to determine base path, or create if it doesn't exist
  let basePath: string | undefined;
  try {
    const { project } = await api.getProject(creds.user.org, projectSlug);
    // Parse base path from project URL
    const url = new URL(project.url);
    basePath = url.pathname;
    log.info(`Project URL: ${project.url}`);
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('404')) {
      // Project doesn't exist, create it
      log.info(`Project '${projectSlug}' not found. Creating...`);
      const { project } = await api.createProject(creds.user.org, {
        name: projectSlug,
      });
      const url = new URL(project.url);
      basePath = url.pathname;
      log.info(`Created project: ${project.url}`);
    } else {
      throw error;
    }
  }

  // Build the project with the correct base path
  log.info('Building project...');
  const ctx = new BuildContext({
    path: resolvedPath,
    base: basePath,
  });

  await buildCommand(ctx, { base: basePath }, resolvedPath);

  // Zip the dist directory
  log.info('Creating deployment package...');
  const distDir = path.resolve(resolvedPath, 'dist');

  // Verify dist directory exists
  try {
    await fs.access(distDir);
  } catch {
    throw new Error(
      `Build output directory not found: ${distDir}\nMake sure the build completed successfully.`
    );
  }

  const zipBuffer = await zipDirectory(distDir);
  const zipSizeKb = Math.round(zipBuffer.byteLength / 1024);
  log.info(`Package size: ${zipSizeKb} KB`);

  // Upload
  log.info('Uploading...');
  const result = await api.uploadVersion(creds.user.org, projectSlug, zipBuffer);

  log.info('');
  log.info(result.message);
  log.info(`Live at: ${result.url}`);
}
