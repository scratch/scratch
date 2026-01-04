import { watch } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { ServerWebSocket } from 'bun';
import type { BuildContext } from '../build/context';
import { buildCommand } from './build';
import { getContentType } from '../util';
import log from '../logger';

/**
 * Known static file extensions that should be served directly.
 * Routes without these extensions will try to serve index.html instead.
 */
const STATIC_FILE_EXTENSIONS = new Set([
  // Web assets
  'html', 'css', 'js', 'mjs', 'json', 'xml', 'txt',
  // Source files (recognized as extensions even though not typically served)
  'ts', 'tsx', 'jsx', 'md', 'mdx',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif',
  // Fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // Media
  'mp3', 'mp4', 'webm', 'ogg', 'wav',
  // Documents
  'pdf', 'zip', 'gz', 'tar',
  // Maps & data
  'map', 'wasm',
]);

/**
 * Check if a pathname ends with a known static file extension.
 * Only considers the last path segment, so `/test.file` returns false
 * but `/style.css` returns true.
 */
export function hasStaticFileExtension(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() || '';
  const match = lastSegment.match(/\.([a-zA-Z0-9]+)$/);
  if (!match || !match[1]) return false;
  return STATIC_FILE_EXTENSIONS.has(match[1].toLowerCase());
}

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

// Store connected WebSocket clients for live reload
const clients = new Set<ServerWebSocket<unknown>>();

/**
 * Try to start a dev server on the given port, with fallback to subsequent ports if in use.
 */
async function startDevServerWithFallback(
  buildDir: string,
  preferredPort: number,
  maxAttempts = 10
): Promise<{ server: ReturnType<typeof Bun.serve>; port: number }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = preferredPort + attempt;
    try {
      const server = Bun.serve({
        port,
        async fetch(req) {
          const url = new URL(req.url);
          let pathname = url.pathname;

          // Handle WebSocket upgrade for live reload
          if (pathname === '/__live_reload') {
            const upgraded = server.upgrade(req);
            if (!upgraded) {
              return new Response('WebSocket upgrade failed', { status: 400 });
            }
            return; // WebSocket upgrade handled
          }

          // Serve files from build directory
          let filePath = path.join(buildDir, pathname);

          // Handle directory index (e.g., /posts -> /posts/index.html)
          // Use allowlist to distinguish routes from static files
          // e.g., /test.file should try index.html, but /style.css should serve directly
          if (!hasStaticFileExtension(pathname)) {
            // Try adding /index.html
            const indexPath = path.join(filePath, 'index.html');
            if (await Bun.file(indexPath).exists()) {
              filePath = indexPath;
            } else if (await Bun.file(filePath + '.html').exists()) {
              filePath = filePath + '.html';
            }
          }

          const file = Bun.file(filePath);
          if (await file.exists()) {
            // For HTML files, inject live reload script
            if (filePath.endsWith('.html')) {
              let content = await file.text();
              content = injectLiveReloadScript(content, port);
              return new Response(content, {
                headers: {
                  'Content-Type': 'text/html',
                  'Cache-Control': 'no-store, no-cache, must-revalidate',
                },
              });
            }

            // For all other files (including binary), serve directly
            // Disable caching in dev mode to ensure fresh content on HMR
            return new Response(file, {
              headers: {
                'Content-Type': getContentType(filePath),
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              },
            });
          }

          return new Response('Not Found', { status: 404 });
        },

        websocket: {
          open(ws) {
            clients.add(ws);
          },
          close(ws) {
            clients.delete(ws);
          },
          message() {
            // No messages expected from client
          },
        },
      });
      return { server, port };
    } catch (error) {
      // If port is in use, try the next one
      const err = error as NodeJS.ErrnoException;
      if (
        err.code === 'EADDRINUSE' ||
        (error instanceof Error && error.message.includes('port'))
      ) {
        log.debug(`Port ${port} in use, trying ${port + 1}`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `Could not find an available port (tried ${preferredPort}-${preferredPort + maxAttempts - 1}).\n` +
      `Check if other processes are using these ports:\n` +
      `  lsof -i :${preferredPort}`
  );
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

  // Start the HTTP server with port fallback
  const { server, port } = await startDevServerWithFallback(
    ctx.buildDir,
    preferredPort
  );

  log.info(`Dev server running at http://localhost:${port}/`);

  // Open browser if requested
  if (options.open !== false) {
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';
    const route = options.route ?? await findRoute(ctx.buildDir);
    Bun.spawn([opener, `http://localhost:${port}${route}`]);
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
        for (const client of clients) {
          client.send('reload');
        }
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

/**
 * Inject live reload script into HTML
 */
function injectLiveReloadScript(html: string, port: number): string {
  const script = `
<script>
(function() {
  const ws = new WebSocket('ws://localhost:${port}/__live_reload');
  ws.onmessage = function(event) {
    if (event.data === 'reload') {
      location.reload();
    }
  };
  ws.onclose = function() {
    // Try to reconnect after a delay
    setTimeout(function() {
      location.reload();
    }, 1000);
  };
})();
</script>`;

  return html.replace('</body>', `${script}\n</body>`);
}
