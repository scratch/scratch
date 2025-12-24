import path from 'path';
import fs from 'fs/promises';
import readline from 'readline';
import { glob } from 'fast-glob';
import { spawnSync } from 'child_process';
import log from './logger';

/**
 * Spawn bun commands synchronously using Node's child_process.
 * Uses the current executable with BUN_BE_BUN=1 so scratch can run bun commands
 * without requiring bun to be installed separately.
 */
export function spawnBunSync(
  args: string[],
  options: { cwd?: string; stdio?: 'pipe' | 'inherit' } = {}
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, args, {
    cwd: options.cwd,
    encoding: 'utf-8',
    stdio: options.stdio === 'inherit' ? 'inherit' : 'pipe',
    env: {
      ...process.env,
      BUN_BE_BUN: '1',
    },
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Run bun install in a directory.
 * Throws an error with helpful message if install fails.
 */
export function bunInstall(cwd: string): void {
  const result = spawnBunSync(['install'], { cwd, stdio: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to install dependencies.\n\n` +
        `This can happen if:\n` +
        `  - No network connection\n` +
        `  - Bun is not installed correctly\n` +
        `  - Disk space is low\n\n` +
        `Details: ${result.stderr || result.stdout || 'Unknown error'}`
    );
  }
}

/**
 * Remove a file or directory with retry logic for transient errors (EACCES, EBUSY).
 * This handles cases where files are temporarily locked by other processes.
 */
export async function rmWithRetry(
  filePath: string,
  options: { recursive?: boolean; force?: boolean } = {},
  maxRetries = 3,
  delayMs = 100
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fs.rm(filePath, options);
      return;
    } catch (error: any) {
      const isRetryable = error?.code === 'EACCES' || error?.code === 'EBUSY';
      if (isRetryable && attempt < maxRetries) {
        log.debug(
          `Retry ${attempt}/${maxRetries} for rm ${filePath}: ${error.code}`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
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
 * Escape HTML entities to prevent XSS when inserting user content into HTML.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get content type for a file based on extension.
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

interface TreeNode {
  [key: string]: TreeNode | null;
}

/**
 * Format a list of file paths as a directory tree.
 */
export function formatFileTree(files: string[]): string[] {
  // Build tree structure
  const tree: TreeNode = {};
  for (const file of files.sort()) {
    const parts = file.split('/');
    let node = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        node[part] = null;
      } else {
        if (!node[part]) node[part] = {};
        node = node[part] as TreeNode;
      }
    }
  }

  // Render tree to lines
  const lines: string[] = [];
  function render(node: TreeNode, prefix: string) {
    // Sort: directories first, then files, alphabetically within each group
    const entries = Object.entries(node).sort(([aName, aChildren], [bName, bChildren]) => {
      const aIsDir = aChildren !== null;
      const bIsDir = bChildren !== null;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return aName.localeCompare(bName);
    });
    entries.forEach(([name, children], index) => {
      const isLast = index === entries.length - 1;
      const connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
      const isDir = children !== null;
      lines.push(prefix + connector + name + (isDir ? '/' : ''));
      if (isDir) {
        const childPrefix = prefix === '' ? '  ' : prefix + (isLast ? '    ' : '│   ');
        render(children, childPrefix);
      }
    });
  }
  render(tree, '');
  return lines;
}

/**
 * Prompt user for yes/no confirmation.
 * Auto-confirms with default value when not running in a TTY (non-interactive).
 */
export async function confirm(question: string, defaultValue: boolean): Promise<boolean> {
  // Auto-confirm when not in a TTY (scripts, tests, piped input)
  if (!process.stdin.isTTY) {
    return defaultValue;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultValue ? '[Y/n]' : '[y/N]';

  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') {
        resolve(defaultValue);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}
