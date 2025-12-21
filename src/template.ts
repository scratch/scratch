import fs from 'fs/promises';
import path from 'path';
import log from './logger';
import { templates, type TemplateCategory } from './template.generated';

export { templates };
export type { TemplateCategory };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Write all templates from a category to a target directory.
 * Does not overwrite existing files unless overwrite is true.
 * Returns list of files that were created.
 */
export async function materializeTemplates(
  category: TemplateCategory,
  targetDir: string,
  options: { overwrite?: boolean } = {}
): Promise<string[]> {
  const { overwrite = false } = options;
  const created: string[] = [];
  const templateFiles = templates[category];

  await fs.mkdir(targetDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(templateFiles)) {
    const targetPath = path.join(targetDir, relativePath);
    const targetDirPath = path.dirname(targetPath);

    await fs.mkdir(targetDirPath, { recursive: true });

    const exists = await fs.exists(targetPath);
    if (exists && !overwrite) {
      log.debug(`Skipped ${relativePath}`);
      continue;
    }

    await fs.writeFile(targetPath, content);
    log.debug(`${exists ? 'Overwrote' : 'Wrote'} ${relativePath}`);
    created.push(relativePath);
  }

  return created;
}

/**
 * Write a single template file to a target path.
 * Creates parent directories as needed.
 */
export async function materializeTemplate(
  category: TemplateCategory,
  filename: string,
  targetPath: string
): Promise<void> {
  const templateFiles = templates[category] as Record<string, string>;
  const content = templateFiles[filename];

  if (!content) {
    throw new Error(`Template not found: ${category}/${filename}`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content);
}

/**
 * Get the content of a template file without writing to disk.
 */
export function getTemplateContent(
  category: TemplateCategory,
  filename: string
): string {
  const templateFiles = templates[category] as Record<string, string>;
  const content = templateFiles[filename];

  if (!content) {
    throw new Error(`Template not found: ${category}/${filename}`);
  }

  return content;
}

/**
 * Check if a template file exists.
 */
export function hasTemplate(
  category: TemplateCategory,
  filename: string
): boolean {
  const templateFiles = templates[category] as Record<string, string>;
  return filename in templateFiles;
}

/**
 * List all template files in a category.
 */
export function listTemplateFiles(category: TemplateCategory): string[] {
  return Object.keys(templates[category]);
}
