// Projects commands: list, create, info, update, link, delete

import { createApiClient } from '../../cloud/api';
import { requireAuth } from '../../cloud/credentials';
import {
  getProjectConfig,
  saveProjectConfig,
} from '../../cloud/projectConfig';
import log from '../../logger';
import type { CreateProjectBody, UpdateProjectBody } from '../../cloud/types';
import * as readline from 'readline';

/**
 * List projects in user's organization
 */
export async function listProjectsCommand(): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const { projects } = await api.listProjects(creds.user.org);

  if (projects.length === 0) {
    log.info('No projects found.');
    log.info('Create one with: scratch cloud projects create <name>');
    return;
  }

  log.info(`Projects in ${creds.user.org}:\n`);
  for (const project of projects) {
    log.info(`  ${project.name}`);
    log.info(`    Display Name: ${project.display_name}`);
    if (project.description) {
      log.info(`    Description: ${project.description}`);
    }
    log.info(`    URL: ${project.url}`);
    log.info(`    Version: ${project.current_version || 'not deployed'}`);
    log.info(`    Access: ${project.view_access}`);
    log.info('');
  }
}

/**
 * Create a new project
 */
export async function createProjectCommand(
  name: string,
  options: { displayName?: string; description?: string; access?: string }
): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const body: CreateProjectBody = {
    display_name: options.displayName || name,
    name: name,
    description: options.description,
    view_access: options.access as 'public' | 'authenticated' | undefined,
  };

  const { project } = await api.createProject(creds.user.org, body);

  log.info(`Created project: ${project.name}`);
  log.info(`Display Name: ${project.display_name}`);
  if (project.description) {
    log.info(`Description: ${project.description}`);
  }
  log.info(`URL: ${project.url}`);
  log.info('');
  log.info('Deploy with: scratch cloud deploy');
}

/**
 * Get project details
 */
export async function projectInfoCommand(projectName: string): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const { project } = await api.getProject(creds.user.org, projectName);

  log.info(`Project: ${project.name}`);
  log.info(`Display Name: ${project.display_name}`);
  if (project.description) {
    log.info(`Description: ${project.description}`);
  }
  log.info(`URL: ${project.url}`);
  log.info(`Version: ${project.current_version || 'not deployed'}`);
  log.info(`Access: ${project.view_access}`);
  log.info(`Created: ${project.created_at}`);
}

/**
 * Update project settings
 */
export async function updateProjectCommand(
  projectName: string,
  options: { displayName?: string; description?: string; access?: string }
): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const body: UpdateProjectBody = {};
  if (options.displayName) body.display_name = options.displayName;
  if (options.description !== undefined) body.description = options.description;
  if (options.access)
    body.view_access = options.access as 'public' | 'authenticated';

  if (Object.keys(body).length === 0) {
    log.info('No changes specified. Use -D, -d, or -a options.');
    return;
  }

  const { project } = await api.updateProject(creds.user.org, projectName, body);

  log.info(`Updated project: ${project.name}`);
  log.info(`Display Name: ${project.display_name}`);
  if (project.description) {
    log.info(`Description: ${project.description}`);
  }
  log.info(`Access: ${project.view_access}`);
}

/**
 * Link current directory to a cloud project
 */
export async function linkProjectCommand(
  projectName: string,
  projectDir: string = '.'
): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  // Fetch project info to verify it exists
  const { project } = await api.getProject(creds.user.org, projectName);

  // Get existing config or create new one
  const existingConfig = await getProjectConfig(projectDir);

  // Save project config
  await saveProjectConfig(projectDir, {
    ...existingConfig,
    name: project.name,
    display_name: project.display_name,
    description: project.description ?? undefined,
    view_access: project.view_access,
  });

  log.info(`Linked to project: ${project.name}`);
  log.info(`Config saved to: .scratch/project.toml`);
  log.info('');
  log.info('Deploy with: scratch cloud deploy');
}

/**
 * Delete a project
 */
export async function deleteProjectCommand(
  projectName: string,
  options: { force?: boolean }
): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  // First verify the project exists
  const { project } = await api.getProject(creds.user.org, projectName);

  // Confirm deletion unless --force is specified
  if (!options.force) {
    const confirmed = await confirmDeletion(project.name);
    if (!confirmed) {
      log.info('Deletion cancelled.');
      return;
    }
  }

  await api.deleteProject(creds.user.org, projectName);

  log.info(`Deleted project: ${project.name}`);
}

/**
 * Prompt user to confirm deletion
 */
async function confirmDeletion(projectName: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `Are you sure you want to delete project "${projectName}"? This cannot be undone. (y/N) `,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    );
  });
}
