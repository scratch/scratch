// Deploy command: build and upload project to cloud

import fs from 'fs/promises';
import path from 'path';
import { globSync } from 'fast-glob';
import JSZip from 'jszip';
import { createApiClient } from '../../cloud/api';
import { getCredentials } from '../../cloud/credentials';
import { getUserConfig } from '../../cloud/userConfig';
import {
  getProjectConfig,
  saveProjectConfig,
  validateProjectName,
  getProjectConfigPath,
} from '../../cloud/projectConfig';
import { buildCommand } from '../build';
import { BuildContext } from '../../build/context';
import { promptText } from '../../util';
import { loginCommand } from './auth';
import { configCommand } from './config';
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
  const resolvedPath = path.resolve(projectPath);

  // 1. Ensure logged in (prompt if not)
  let creds = await getCredentials();
  if (!creds) {
    log.info('Not logged in. Starting login flow...\n');
    await loginCommand();
    creds = await getCredentials();
    if (!creds) {
      throw new Error('Login required to deploy');
    }
  }

  // 2. Ensure server URL configured
  let userConfig = await getUserConfig();
  if (!userConfig?.serverUrl) {
    log.info('Server not configured. Starting setup...\n');
    await configCommand({});
    userConfig = await getUserConfig();
    if (!userConfig?.serverUrl) {
      throw new Error('Server URL required to deploy');
    }
  }

  // 3. Load or create project config
  let projectConfig = await getProjectConfig(resolvedPath);
  let projectName: string;

  if (options.project) {
    // CLI option overrides stored config
    const error = validateProjectName(options.project);
    if (error) {
      throw new Error(`Invalid project name: ${error}`);
    }
    projectName = options.project;
    // Update stored config
    await saveProjectConfig(resolvedPath, { name: projectName });
    log.debug(`Updated project config: ${getProjectConfigPath(resolvedPath)}`);
  } else if (projectConfig?.name) {
    // Use stored config
    projectName = projectConfig.name;
    log.debug(`Using project from config: ${projectName}`);
  } else {
    // Prompt for project name
    projectName = await promptText(
      'Project name',
      undefined,
      validateProjectName
    );
    await saveProjectConfig(resolvedPath, { name: projectName });
    log.info(`Saved project config to ${getProjectConfigPath(resolvedPath)}`);
  }

  log.info(`\nDeploying to ${creds.user.org}/${projectName}...`);

  // 4. Get/create project on server
  const api = createApiClient(creds);
  let basePath: string;

  try {
    const { project } = await api.getProject(creds.user.org, projectName);
    const url = new URL(project.url);
    basePath = url.pathname;
    log.debug(`Project exists: ${project.url}`);
  } catch (error: any) {
    if (
      error.message?.includes('not found') ||
      error.message?.includes('404')
    ) {
      log.info(`Creating project '${projectName}'...`);
      const { project } = await api.createProject(creds.user.org, {
        name: projectName,
      });
      const url = new URL(project.url);
      basePath = url.pathname;
      log.info(`Created project: ${project.url}`);
    } else {
      throw error;
    }
  }

  // 5. Build project with correct base path
  log.info('Building...');
  const ctx = new BuildContext({
    path: resolvedPath,
    base: basePath,
  });

  await buildCommand(ctx, { base: basePath }, resolvedPath);

  // 6. Zip and upload
  log.info('Creating deployment package...');
  const distDir = path.resolve(resolvedPath, 'dist');

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

  log.info('Uploading...');
  const result = await api.uploadVersion(creds.user.org, projectName, zipBuffer);

  log.info('');
  log.info(result.message);
  log.info(`Live at: ${result.url}`);
}
