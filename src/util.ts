import path from 'path';
import fs from 'fs/promises';
import { glob } from 'fast-glob';

/**
 * Simple template rendering function
 * @param template
 * @param variables
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
) {
  return template.replace(
    /\{\{([a-zA-Z0-9_]+)\}\}/g,
    (match, variable) => variables[variable] || `{{${variable}}}`
  );
}

/**
 * Render a template file and write the result to a rendered file
 * @param templatePath The path to the template file
 * @param renderedPath The path to the rendered file
 * @param variables The variables to pass to the template
 * @param importPathVariables These variables will be rendered as paths relative to the rendered file
 */
export async function render(
  templatePath: string,
  renderedPath: string,
  variables: Record<string, string> = {},
  importPathVariables: Record<string, string> = {}
) {
  const template = await fs.readFile(templatePath, 'utf-8');
  Object.entries(importPathVariables).forEach(([key, value]) => {
    variables[key] = path.relative(path.dirname(renderedPath), value);
  });
  const rendered = renderTemplate(template, variables);
  await fs.mkdir(path.dirname(renderedPath), { recursive: true });
  await fs.writeFile(renderedPath, rendered);
}

export interface FileMapResult {
  map: Record<string, string>;
  conflicts: Set<string>;
}

/**
 * Build a map of file paths to names based on a glob pattern.
 * Also tracks conflicts when multiple files map to the same name.
 *
 * @param baseDir
 * @param pattern
 * @param basename
 * @returns
 */
export async function buildFileMap(
  baseDir: string,
  pattern: string,
  basename: boolean
): Promise<FileMapResult> {
  const files = await glob(pattern, {
    cwd: baseDir,
    absolute: true,
  });

  const map: Record<string, string> = {};
  const conflicts = new Set<string>();

  for (const file of files) {
    const relativePath = path.relative(baseDir, file);
    const withoutExt = relativePath.replace(/\.[^/.]+$/, '');
    const name = basename ? path.basename(withoutExt) : withoutExt;

    if (name in map) {
      conflicts.add(name);
    }
    map[name] = file;
  }

  return { map, conflicts };
}

/**
 * Get content type for a file based on extension
 */
export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  return types[ext] || 'application/octet-stream';
}
