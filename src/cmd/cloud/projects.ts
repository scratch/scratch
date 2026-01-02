// Projects commands: list, create, info, update

import { createApiClient } from '../../cloud/api';
import { requireAuth } from '../../cloud/credentials';
import log from '../../logger';
import type { CreateProjectBody, UpdateProjectBody } from '../../cloud/types';

/**
 * List projects in user's organization
 */
export async function listProjectsCommand(): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const { projects } = await api.listProjects(creds.user.org);

  if (projects.length === 0) {
    log.info('No projects found.');
    log.info('Create one with: scratch cloud projects create <display-name>');
    return;
  }

  log.info(`Projects in ${creds.user.org}:\n`);
  for (const project of projects) {
    log.info(`  ${project.name}`);
    log.info(`    Display Name: ${project.display_name}`);
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
  displayName: string,
  options: { name?: string; access?: string }
): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const body: CreateProjectBody = {
    display_name: displayName,
    name: options.name,
    view_access: options.access as 'public' | 'authenticated' | undefined,
  };

  const { project } = await api.createProject(creds.user.org, body);

  log.info(`Created project: ${project.name}`);
  log.info(`Display Name: ${project.display_name}`);
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
  options: { displayName?: string; access?: string }
): Promise<void> {
  const creds = await requireAuth();
  const api = createApiClient(creds);

  const body: UpdateProjectBody = {};
  if (options.displayName) body.display_name = options.displayName;
  if (options.access)
    body.view_access = options.access as 'public' | 'authenticated';

  if (Object.keys(body).length === 0) {
    log.info('No changes specified. Use --display-name or --access options.');
    return;
  }

  const { project } = await api.updateProject(creds.user.org, projectName, body);

  log.info(`Updated project: ${project.name}`);
  log.info(`Display Name: ${project.display_name}`);
  log.info(`Access: ${project.view_access}`);
}
