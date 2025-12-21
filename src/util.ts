import path from 'path';
import fs from 'fs/promises';
import { glob } from 'fast-glob';
import log from './logger';

/**
 * Resolve a package path
 * @param pkg
 */
export function resolvePkg(pkg: string) {
  return path.dirname(require.resolve(pkg));
}

/**
 * If `p` is not an absolute path, resolve relative to `root`
 * @param p
 * @param root
 */
export function resolve(p: string, root: string = process.cwd()) {
  if (path.isAbsolute(p)) {
    return p;
  }
  return path.join(root, p);
}

/**
 * Format a byte count so that it is human readable
 * @param bytes
 */
export function fmtBytes(bytes: number, precision = 0) {
  const units = ['B', 'kB', 'mB', 'gB', 'tB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(precision)}${units[i]}`;
}

/**
 * Simple template rendering function
 * @param templatePath
 * @param variables
 */
export async function renderTemplateFile(
  templatePath: string,
  variables: Record<string, string>
) {
  const template = await fs.readFile(templatePath, 'utf-8');
  return renderTemplate(template, variables);
}

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


/**
 * Replace multiple strings in a file
 * @param filePath
 * @param replacements
 */
export async function replaceInFile(
  filePath: string,
  replacements: { search: string; replace: string }[]
) {
  const content = await fs.readFile(filePath, 'utf-8');
  const newContent = replacements.reduce(
    (content, replacement) =>
      content.replace(replacement.search, replacement.replace),
    content
  );
  await fs.writeFile(filePath, newContent);
}

interface mirrorOptions {
  recursive?: boolean;
  overwrite?: boolean;
}

/**
 * Copy files and directories in fromDir to toDir. Do not overwrite files or directories
 * that already exist.
 * @param fromDir
 * @param toDir
 * @param recursive
 * @returns List of relative paths that were created
 */
export async function mirror(
  fromDir: string,
  toDir: string,
  { recursive = false, overwrite = false }: mirrorOptions
): Promise<string[]> {
  const created: string[] = [];
  // create the destination directory if it doesn't exist. This covers the case where
  // there are no files in the destination directory
  await fs.mkdir(toDir, { recursive: true });
  const entries = await fs.readdir(fromDir, { withFileTypes: true, recursive });
  await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (file) => {
        const srcDir = file.parentPath;
        const srcFile = path.resolve(srcDir, file.name);
        const relDir = path.relative(fromDir, srcDir);
        const relFile = path.join(relDir, file.name);
        const destDir = path.resolve(toDir, relDir);
        const destFile = path.resolve(destDir, file.name);
        await fs.mkdir(destDir, { recursive: true });
        if (await fs.exists(destFile)) {
          if (overwrite) {
            await fs.copyFile(srcFile, destFile);
            log.debug(`Overwrote ${relFile}`);
            created.push(relFile);
          } else {
            log.debug(`Skipped ${relFile}`);
          }
        } else {
          await fs.copyFile(srcFile, destFile);
          log.debug(`Wrote ${relFile}`);
          created.push(relFile);
        }
      })
  );
  return created;
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
 * Map a function onto the values of each key in an object
 */
export function objMap(obj: any, fn: (val: any) => any) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, val]) => [key, fn(val)])
  );
}

/**
 * Map an async function onto the values of each key in an object
 */
export async function objMapAsync(obj: any, fn: (val: any) => Promise<any>) {
  const entries = await Promise.all(
    Object.entries(obj).map(async ([key, val]) => [key, await fn(val)])
  );
  return Object.fromEntries(entries);
}

/**
 * Return the first path that points to an existing file
 */
export async function firstExistingPath(paths: string[], baseDir?: string) {
  for (let p of paths) {
    p = baseDir && !path.isAbsolute(p) ? path.join(baseDir, p) : p;
    if (await fs.exists(p)) {
      return p;
    }
  }
  throw new Error(`No existing path found`);
}

/**
 * Check if a path exists and prompt the user to confirm if it should be overwritten. Returns true
 * if the path does not exist or the user confirms the overwrite.
 */
export async function safeToWrite(path: string): Promise<boolean> {
  if (await fs.exists(path)) {
    const overwrite = prompt(`${path} already exists. Overwrite? (y/n)`);
    if (overwrite !== 'y') {
      return false;
    }
  }
  return true;
}
