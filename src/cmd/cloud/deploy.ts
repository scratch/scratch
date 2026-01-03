// Deploy command: build and upload project to cloud

import fs from 'fs/promises';
import path from 'path';
import { globSync } from 'fast-glob';
import JSZip from 'jszip';
import { createApiClient } from '../../cloud/api';
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
import { ensureValidCredentials } from './auth';
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

const DEFAULT_SERVER_URL = 'https://app.scratch.dev';

/**
 * Deploy current project to cloud
 */
export async function deployCommand(
  projectPath: string = '.',
  options: DeployOptions = {}
): Promise<void> {
  const resolvedPath = path.resolve(projectPath);

  // 1. Ensure logged in (validates token and auto-re-logins if expired)
  const creds = await ensureValidCredentials();

  // 2. Load project and user configs
  let projectConfig = await getProjectConfig(resolvedPath);
  const userConfig = await getUserConfig();

  // 3. Determine server URL with cascading defaults (no prompt if already configured)
  let serverUrl =
    projectConfig?.serverUrl ||
    userConfig?.serverUrl ||
    creds.server;  // Server from credentials file

  // Only prompt if no server URL is configured anywhere
  if (!serverUrl) {
    serverUrl = await promptText(
      'Server URL',
      DEFAULT_SERVER_URL,
      (url) => {
        try {
          new URL(url);
          return null;
        } catch {
          return 'Invalid URL';
        }
      }
    );

    // Save server URL to project config
    projectConfig = {
      ...projectConfig,
      name: projectConfig?.name || '',
      serverUrl,
    };

    // Update global config with server URL
    await configCommand({ server: serverUrl });
  }

  // 4. Load or create project name
  let projectName: string;

  if (options.project) {
    // CLI option overrides stored config
    const error = validateProjectName(options.project);
    if (error) {
      throw new Error(`Invalid project name: ${error}`);
    }
    projectName = options.project;
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
  }

  // Save project config
  await saveProjectConfig(resolvedPath, {
    ...projectConfig,
    name: projectName,
    serverUrl,
  });
  log.debug(`Updated project config: ${getProjectConfigPath(resolvedPath)}`);

  log.info(`\nDeploying to ${creds.user.org}/${projectName}...`);

  // 5. Get/create project on server
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
      // Use project name as display name when auto-creating
      const { project } = await api.createProject(creds.user.org, {
        display_name: projectConfig?.display_name || projectName,
        name: projectName,
        view_access: projectConfig?.view_access,
      });
      const url = new URL(project.url);
      basePath = url.pathname;
      log.info(`Created project: ${project.url}`);

      // Use the server-normalized project name (lowercase)
      projectName = project.name;

      // Save display_name and view_access from the created project
      await saveProjectConfig(resolvedPath, {
        ...projectConfig,
        name: project.name,
        display_name: project.display_name,
        view_access: project.view_access,
        serverUrl,
      });
    } else {
      throw error;
    }
  }

  // 6. Build project with correct base path
  log.info('Building...');
  const ctx = new BuildContext({
    path: resolvedPath,
    base: basePath,
  });

  await buildCommand(ctx, { base: basePath }, resolvedPath);

  // 7. Zip and upload
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
