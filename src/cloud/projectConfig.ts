// Project-level configuration stored in <project>/.scratch/project.toml

import fs from 'fs/promises';
import path from 'path';
import { parse, stringify } from 'smol-toml';

export interface ProjectConfig {
  name: string; // Project slug (validated: letters, numbers, -, _, .)
  serverUrl?: string; // Optional per-project server override
}

/**
 * Valid project name pattern: letters, numbers, dash, underscore, dot
 */
const PROJECT_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * Validate project name
 * Returns null if valid, error message if invalid
 */
export function validateProjectName(name: string): string | null {
  if (!name) {
    return 'Project name is required';
  }
  if (!PROJECT_NAME_PATTERN.test(name)) {
    return 'Project name can only contain letters, numbers, dashes, underscores, and dots';
  }
  return null;
}

/**
 * Get the path to the project config file
 */
export function getProjectConfigPath(projectDir: string): string {
  return path.join(projectDir, '.scratch', 'project.toml');
}

/**
 * Get project config from <project>/.scratch/project.toml
 */
export async function getProjectConfig(
  projectDir: string
): Promise<ProjectConfig | null> {
  try {
    const configPath = getProjectConfigPath(projectDir);
    const content = await fs.readFile(configPath, 'utf-8');
    return parse(content) as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Save project config to <project>/.scratch/project.toml
 */
export async function saveProjectConfig(
  projectDir: string,
  config: ProjectConfig
): Promise<void> {
  const configPath = getProjectConfigPath(projectDir);
  const dir = path.dirname(configPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, stringify(config) + '\n');
}
