import { watch } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { BuildContext } from '../build/context';
import { buildCommand } from './build';
import { openBrowser } from '../util';
import log from '../logger';
import { startServerWithFallback, hasStaticFileExtension, notifyLiveReloadClients } from './server';

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

  log.debug('Starting Bun dev server...');

  // Initial build
  await buildCommand(ctx, { ssg: false, static: options.static });

  // Start the HTTP server with port fallback and live reload
  const { server, port } = await startServerWithFallback({
    buildDir: ctx.buildDir,
    port: preferredPort,
    liveReload: true,
  });

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
  const shutdown = () => {
    log.info('Shutting down...');
    for (const watcher of watchers) {
      watcher.close();
    }
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
