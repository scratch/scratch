import { watch } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { BuildContext } from '../build/context';
import { buildCommand } from './build';
import { openBrowser } from '../util';
import log from '../logger';
import { startServerWithFallback, hasStaticFileExtension, notifyLiveReloadClients } from './server';

/**
 * Lock file data structure for preventing multiple dev servers in the same project.
 */
interface DevLock {
  pid: number;
  port: number;
}

/**
 * Check if a process with the given PID is running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the lock file path for a project.
 */
export function getLockFilePath(rootDir: string): string {
  return path.join(rootDir, '.scratch', 'dev.lock');
}

/**
 * Try to read the lock file and check if a dev server is already running.
 * Returns the lock data if a valid lock exists (process is running), null otherwise.
 */
export async function readLock(lockPath: string): Promise<DevLock | null> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8');
    const lock: DevLock = JSON.parse(content);

    // Validate lock structure
    if (typeof lock.pid !== 'number' || typeof lock.port !== 'number') {
      return null;
    }

    // Check if the process is still running
    if (isProcessRunning(lock.pid)) {
      return lock;
    }

    // Stale lock file - process no longer running
    log.debug(`Stale lock file found (PID ${lock.pid} not running), removing...`);
    await fs.rm(lockPath, { force: true });
    return null;
  } catch {
    // Lock file doesn't exist or is invalid
    return null;
  }
}

/**
 * Write a lock file.
 */
export async function writeLock(lockPath: string, lock: DevLock): Promise<void> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2));
}

/**
 * Remove the lock file.
 */
export async function removeLock(lockPath: string): Promise<void> {
  try {
    await fs.rm(lockPath, { force: true });
  } catch {
    // Ignore errors when removing lock
  }
}

// Re-export for backward compatibility with tests
export { hasStaticFileExtension };

/**
 * Given a build directory, find the best route to open in the dev server.
 * Uses DFS to search recursively for index.html files.
 * Returns '/' if nothing found.
 */
export async function findRoute(dir: string): Promise<string> {
  const result = await findRouteRecursive(dir, dir);
  return result || '/';
}

/**
 * DFS to find the first index.html file.
 */
async function findRouteRecursive(
  baseDir: string,
  currentDir: string
): Promise<string | null> {
  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return null;
  }

  // Sort for deterministic order
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = entries.filter((e) => e.isFile());
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

  // Check for index.html (indicates a valid route)
  if (files.some((e) => e.name === 'index.html')) {
    const relativePath = path.relative(baseDir, currentDir);
    return relativePath ? `/${relativePath}` : '/';
  }

  // DFS into subdirectories
  for (const subdir of dirs) {
    const result = await findRouteRecursive(baseDir, path.join(currentDir, subdir.name));
    if (result) {
      return result;
    }
  }

  return null;
}

interface DevOptions {
  port?: number;
  open?: boolean;
  route?: string; // Route to open in browser, auto-detected if not specified
  static?: 'public' | 'assets' | 'all';
}

/**
 * Run a development server using Bun
 */
export async function devCommand(ctx: BuildContext, options: DevOptions = {}) {
  const preferredPort = typeof options.port === 'string' ? parseInt(options.port, 10) : (options.port || 5173);

  // Validate port number
  if (isNaN(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
    throw new Error(
      `Invalid port number: "${options.port}". Port must be a number between 1 and 65535.`
    );
  }

  // Check if another dev server is already running in this project
  const lockPath = getLockFilePath(ctx.rootDir);
  const existingLock = await readLock(lockPath);

  if (existingLock) {
    log.info(`Dev server already running on port ${existingLock.port} (PID ${existingLock.pid})`);
    log.info('Opening browser to existing server...');

    // Open browser to existing server
    if (options.open !== false) {
      const route = options.route ?? '/';
      await openBrowser(`http://localhost:${existingLock.port}${route}`);
    }

    // Exit gracefully - don't start a new server
    return;
  }

  log.debug('Starting Bun dev server...');

  // Initial build
  await buildCommand(ctx, { ssg: false, static: options.static });

  // Start the HTTP server with port fallback and live reload
  const { server, port } = await startServerWithFallback({
    buildDir: ctx.buildDir,
    port: preferredPort,
    liveReload: true,
  });

  // Write lock file with our PID and port
  await writeLock(lockPath, { pid: process.pid, port });

  log.info(`Dev server running at http://localhost:${port}/`);

  // Open browser if requested
  if (options.open !== false) {
    const route = options.route ?? await findRoute(ctx.buildDir);
    await openBrowser(`http://localhost:${port}${route}`);
  }

  // Watch for file changes (pages, src, and public)
  const watchDirs = [ctx.pagesDir, ctx.srcDir, ctx.staticDir];
  const watchers: ReturnType<typeof watch>[] = [];

  let rebuildTimeout: Timer | null = null;
  let isRebuilding = false;
  let watchingEnabled = true;

  const debouncedRebuild = () => {
    if (!watchingEnabled) return;
    if (rebuildTimeout) {
      clearTimeout(rebuildTimeout);
    }
    rebuildTimeout = setTimeout(async () => {
      if (isRebuilding) return;
      isRebuilding = true;
      watchingEnabled = false; // Pause watching during build
      log.info('File change detected, rebuilding...');
      try {
        await buildCommand(ctx, { ssg: false, static: options.static });
        // Notify all connected clients to reload
        notifyLiveReloadClients();
        log.debug('Rebuild complete, reloading browsers...');
      } catch (error) {
        log.error('Rebuild failed:', error);
      } finally {
        isRebuilding = false;
        // Resume watching after a brief delay to let filesystem settle
        setTimeout(() => { watchingEnabled = true; }, 100);
      }
    }, 100);
  };

  for (const dir of watchDirs) {
    try {
      const watcher = watch(dir, { recursive: true }, (event, filename) => {
        if (filename && !filename.startsWith('.')) {
          log.debug(`File ${event}: ${filename}`);
          debouncedRebuild();
        }
      });
      watchers.push(watcher);
    } catch {
      // Directory might not exist, skip
    }
  }

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');

    // Remove lock file
    await removeLock(lockPath);

    for (const watcher of watchers) {
      watcher.close();
    }
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
