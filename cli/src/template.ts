import fs from 'fs/promises';
import path from 'path';
import log from './logger';
import { templates, type TemplateFile } from './template.generated';

export { templates };

/**
 * Get the content to write for a template file.
 * Decodes base64 for binary files.
 */
function getWritableContent(file: TemplateFile): string | Buffer {
  if (file.binary) {
    return Buffer.from(file.content, 'base64');
  }
  return file.content;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export interface MaterializeOptions {
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
}

/**
 * Write project templates to a target directory.
 * Excludes _build/ and _config/ files (internal build infrastructure).
 *
 * Returns list of files that were created.
 */
export async function materializeProjectTemplates(
  targetDir: string,
  options: MaterializeOptions = {}
): Promise<string[]> {
  const { overwrite = false } = options;
  const created: string[] = [];

  await fs.mkdir(targetDir, { recursive: true });

  for (const [relativePath, file] of Object.entries(templates)) {
    // Skip internal build/config files
    if (relativePath.startsWith('_build/') || relativePath.startsWith('_config/')) {
      continue;
    }

    const targetPath = path.join(targetDir, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const exists = await fs.exists(targetPath);
    if (exists && !overwrite) {
      log.debug(`Skipped ${relativePath}`);
      continue;
    }

    await fs.writeFile(targetPath, getWritableContent(file));
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
  templatePath: string,
  targetPath: string
): Promise<void> {
  const file = templates[templatePath];

  if (!file) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, getWritableContent(file));
}

/**
 * Get the content of a template file without writing to disk.
 * For text files, returns the string content.
 * For binary files, returns the base64-decoded content as a string.
 */
export function getTemplateContent(templatePath: string): string {
  const file = templates[templatePath];

  if (!file) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  if (file.binary) {
    return Buffer.from(file.content, 'base64').toString();
  }
  return file.content;
}

/**
 * Check if a template file exists.
 */
export function hasTemplate(templatePath: string): boolean {
  return templatePath in templates;
}

/**
 * Check if a template file is binary.
 */
export function isTemplateBinary(templatePath: string): boolean {
  const file = templates[templatePath];
  return file?.binary ?? false;
}

/**
 * List all template files.
 */
export function listTemplateFiles(): string[] {
  return Object.keys(templates);
}

/**
 * List user-facing template files (excludes internal _build/ and _config/ files).
 */
export function listUserFacingTemplateFiles(): string[] {
  return Object.keys(templates).filter((f) => !f.startsWith('_build/') && !f.startsWith('_config/'));
}
