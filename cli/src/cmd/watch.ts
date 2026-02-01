import { watch } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createCommand } from './create';
import { devCommand } from './dev';
import { BuildContext } from '../build/context';
import { VERSION } from '../version';
import { bunInstall } from '../util';
import log from '../logger';

export const CACHE_DIR = path.join(os.homedir(), '.scratch', 'cache');

interface WatchOptions {
  port?: number;
  open?: boolean;
}

export async function watchCommand(
  filePath: string,
  options: WatchOptions = {}
): Promise<void> {
  const absolutePath = path.resolve(filePath);

  // Verify path exists
  if (!(await fs.exists(absolutePath))) {
    log.error(`Path not found: ${filePath}`);
    process.exit(1);
  }

  const stat = await fs.stat(absolutePath);
  const isDirectory = stat.isDirectory();

  log.info(`Rendering ${isDirectory ? 'directory' : 'file'} ${filePath}`);

  // Create temp directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scratch-watch-'));
  const tempPagesDir = path.join(tempDir, 'pages');

  // Cleanup function
  const cleanup = async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }
  };

  // Setup signal handlers for cleanup
  const shutdown = async () => {
    log.info('Shutting down...');
    await cleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // 1. Create project in temp dir
    await createCommand(tempDir, { quiet: true });
    log.debug(`Created temp project in ${tempDir}`);

    // 2. Set up cached node_modules
    // Structure: ~/.scratch/cache/[version]/node_modules/
    // Symlink temp/node_modules → ~/.scratch/cache/[version]/node_modules/
    const cacheVersionDir = path.join(CACHE_DIR, VERSION);
    const nodeModulesCache = path.join(cacheVersionDir, 'node_modules');
    await fs.mkdir(nodeModulesCache, { recursive: true });
    await fs.symlink(nodeModulesCache, path.join(tempDir, 'node_modules'));

    // Install dependencies if cache is empty (first run for this version)
    const reactPath = path.join(nodeModulesCache, 'react');
    if (!(await fs.exists(reactPath))) {
      // Clean up old cache versions before installing new one
      await cleanupOldCacheVersions(VERSION);
      log.info('Installing dependencies (first run, this will be cached)...');
      bunInstall(tempDir);
      log.info('Dependencies installed');
    }

    // Track the route to open (auto-detect for directories, calculate for files)
    let route: string | undefined;

    if (isDirectory) {
      // Directory: replace empty pages/ with symlink to user's directory
      await fs.rm(tempPagesDir, { recursive: true, force: true });
      await fs.symlink(absolutePath, tempPagesDir);
    } else {
      // File: copy with original name, watch for changes
      const filename = path.basename(absolutePath);
      const targetFile = path.join(tempPagesDir, filename);
      const parentDir = path.dirname(absolutePath);

      // Calculate route from filename (strip extension, handle index specially)
      const basename = path.basename(absolutePath, path.extname(absolutePath));
      route = basename === 'index' ? '/' : `/${basename}`;

      // Remove the template's index.mdx to avoid conflicts
      // (e.g., user's index.md would conflict with template's index.mdx)
      const templateIndex = path.join(tempPagesDir, 'index.mdx');
      if (filename !== 'index.mdx') {
        await fs.rm(templateIndex, { force: true });
      }

      await fs.copyFile(absolutePath, targetFile);

      // Track whether file currently exists
      let fileExists = true;

      // Watch the parent directory to detect file recreation
      // (watching the file directly stops working when the file is deleted)
      watch(parentDir, async (event, changedFile) => {
        // Only react to changes to our target file
        if (changedFile !== filename) return;

        const nowExists = await fs.exists(absolutePath);

        if (!nowExists && fileExists) {
          // File was deleted
          fileExists = false;
          log.info('Source file deleted, waiting for it to be recreated...');
        } else if (nowExists) {
          // File exists - either it was just created or modified
          try {
            await fs.copyFile(absolutePath, targetFile);
            if (!fileExists) {
              log.info('Source file recreated, synced');
              fileExists = true;
            } else {
              log.debug('File updated');
            }
          } catch {
            // File might be mid-write, ignore
          }
        }
      });
    }

    // 3. Create build context for temp dir and run dev server
    const ctx = new BuildContext({ path: tempDir, port: options.port });
    await devCommand(ctx, {
      port: options.port,
      open: options.open,
      route,
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * Remove all cache version directories except the current version.
 * Called when installing dependencies for a new version to prevent accumulation.
 * @param currentVersion - The version to keep
 * @param cacheDir - Optional cache directory (defaults to CACHE_DIR, used for testing)
 */
export async function cleanupOldCacheVersions(
  currentVersion: string,
  cacheDir: string = CACHE_DIR
): Promise<void> {
  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== currentVersion) {
        const oldVersionDir = path.join(cacheDir, entry.name);
        log.debug(`Removing old cache version: ${entry.name}`);
        await fs.rm(oldVersionDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    // Ignore errors - cleanup is best-effort
    log.debug(`Failed to cleanup old cache versions: ${error}`);
  }
}
