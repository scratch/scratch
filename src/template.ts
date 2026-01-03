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
// TEMPLATE TIERS
// ============================================================================

/**
 * Files included in minimal tier (create command without --src)
 * All other project files are in the "src" tier (src/*)
 */
const MINIMAL_FILES = new Set(['.gitignore', 'AGENTS.md', 'pages/index.mdx']);

/**
 * Infrastructure files included in --minimal mode.
 * Only essential files that don't require branding assets.
 */
const MINIMAL_INFRASTRUCTURE_FILES = new Set([
  'public/favicon.svg', // Required for browser tab icon
]);

/**
 * File overrides for --minimal mode.
 * Maps standard template files to their minimal alternatives.
 */
const MINIMAL_FILE_OVERRIDES: Record<string, string> = {
  'src/template/PageWrapper.jsx': 'src/template/PageWrapper.minimal.jsx',
};

/**
 * Files to skip entirely in --minimal mode (replaced by overrides or not needed).
 */
const MINIMAL_SKIP_FILES = new Set([
  'src/template/PageWrapper.jsx',         // Replaced by PageWrapper.minimal.jsx
  'src/template/PageWrapper.minimal.jsx', // Written via override, not directly
  'src/template/Header.jsx',              // Not used in minimal mode
  'src/template/Footer.jsx',              // Not used in minimal mode
  'src/template/ScratchBadge.jsx',        // Not used in minimal mode
  'src/template/Copyright.jsx',           // Not used in minimal mode
]);

/**
 * Check if a file belongs to the minimal tier
 */
function isMinimalFile(relativePath: string): boolean {
  // Check exact matches
  if (MINIMAL_FILES.has(relativePath)) {
    return true;
  }
  // public/ directory
  if (relativePath.startsWith('public/')) {
    return true;
  }
  // pages/components/ directory
  if (relativePath.startsWith('pages/components/')) {
    return true;
  }
  return false;
}

/**
 * Check if a file belongs to the src tier (src/*)
 */
function isSrcFile(relativePath: string): boolean {
  return relativePath.startsWith('src/');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export interface MaterializeOptions {
  /** Include src/ directory (default: true) */
  includeSrc?: boolean;
  /** Minimal mode: skip example content, use minimal PageWrapper (default: false) */
  minimal?: boolean;
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
}

/**
 * Write project templates to a target directory.
 * Excludes _build/ files (internal build infrastructure).
 *
 * Tiers:
 * - Minimal: pages/index.mdx, pages/components/, public/, .gitignore, AGENTS.md
 * - Src: src/* (controlled by includeSrc)
 *
 * Returns list of files that were created.
 */
export async function materializeProjectTemplates(
  targetDir: string,
  options: MaterializeOptions = {}
): Promise<string[]> {
  const {
    includeSrc = true,
    minimal = false,
    overwrite = false,
  } = options;
  const created: string[] = [];

  await fs.mkdir(targetDir, { recursive: true });

  // In minimal mode, create empty pages/ directory (public/ will have favicon)
  if (minimal) {
    const pagesDir = path.join(targetDir, 'pages');
    await fs.mkdir(pagesDir, { recursive: true });
    created.push('pages/');
    log.debug('Created empty pages/ directory');
  }

  for (const [relativePath, file] of Object.entries(templates)) {
    // Skip _build/ files (internal build infrastructure)
    if (relativePath.startsWith('_build/')) {
      continue;
    }

    // Determine if file should be included based on tier
    const isMinimalTier = isMinimalFile(relativePath);
    const isSrc = isSrcFile(relativePath);

    // Skip src tier files unless includeSrc is true
    if (isSrc && !includeSrc) {
      continue;
    }

    // In minimal mode, apply special handling
    if (minimal) {
      // Skip files that are replaced or not needed in minimal mode
      if (MINIMAL_SKIP_FILES.has(relativePath)) {
        continue;
      }

      // Skip pages/ and public/ content (except infrastructure files)
      if (
        (relativePath.startsWith('pages/') || relativePath.startsWith('public/')) &&
        !MINIMAL_INFRASTRUCTURE_FILES.has(relativePath)
      ) {
        continue;
      }
    }

    // Skip files that don't belong to any known tier (shouldn't happen)
    if (!isMinimalTier && !isSrc) {
      log.debug(`Skipping unknown tier file: ${relativePath}`);
      continue;
    }

    // Determine the actual file path to write (handle overrides in minimal mode)
    let outputPath = relativePath;
    if (minimal && relativePath in MINIMAL_FILE_OVERRIDES) {
      // This shouldn't happen since we skip these files, but just in case
      continue;
    }

    const targetPath = path.join(targetDir, outputPath);
    const targetDirPath = path.dirname(targetPath);

    await fs.mkdir(targetDirPath, { recursive: true });

    const exists = await fs.exists(targetPath);
    if (exists && !overwrite) {
      log.debug(`Skipped ${outputPath}`);
      continue;
    }

    await fs.writeFile(targetPath, getWritableContent(file));
    log.debug(`${exists ? 'Overwrote' : 'Wrote'} ${outputPath}`);
    created.push(outputPath);
  }

  // In minimal mode, also write the override files
  if (minimal) {
    for (const [originalPath, overridePath] of Object.entries(MINIMAL_FILE_OVERRIDES)) {
      const file = templates[overridePath];
      if (!file) {
        log.debug(`Override template not found: ${overridePath}`);
        continue;
      }

      // Write override to the original path location
      const targetPath = path.join(targetDir, originalPath);
      const targetDirPath = path.dirname(targetPath);

      await fs.mkdir(targetDirPath, { recursive: true });

      const exists = await fs.exists(targetPath);
      if (exists && !overwrite) {
        log.debug(`Skipped ${originalPath} (override)`);
        continue;
      }

      await fs.writeFile(targetPath, getWritableContent(file));
      log.debug(`${exists ? 'Overwrote' : 'Wrote'} ${originalPath} (from ${overridePath})`);
      created.push(originalPath);
    }
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
 * List user-facing template files (excludes internal _build/ files).
 */
export function listUserFacingTemplateFiles(): string[] {
  return Object.keys(templates).filter((f) => !f.startsWith('_build/'));
}
