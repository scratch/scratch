import { watch } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { ServerWebSocket } from 'bun';
import { getBuildContext } from '../context';
import { buildCommand } from './build';
import { getContentType } from '../util';
import log from '../logger';

/**
 * Given a directory, find the best route to open in the dev server.
 * Prefers / if /index.md[x] exists, otherwise first markdown file
 * alphabetically. Returns / if no markdown files are found.
 */
export async function findRoute(dir: string): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  // Get all markdown files
  const mdFiles = entries
    .filter(
      (e) => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.mdx'))
    )
    .map((e) => e.name);

  // Return the route if  the directory contains an index file, or if there
  // are no markdown files
  if (
    mdFiles.includes('index.mdx') ||
    mdFiles.includes('index.md') ||
    mdFiles.length == 0
  ) {
    return '/';
  }

  // Return the route corresponding to the first markdown file (alphabetically)
  mdFiles.sort();
  const firstFile = mdFiles[0];
  const basename = path.basename(firstFile, path.extname(firstFile));
  return `/${basename}`;
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
          if (!pathname.includes('.')) {
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
export async function devCommand(options: DevOptions = {}) {
  const ctx = getBuildContext();
  const preferredPort = options.port || 5173;

  // Validate port number
  if (isNaN(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
    throw new Error(
      `Invalid port number: "${options.port}". Port must be a number between 1 and 65535.`
    );
  }

  log.debug('Starting Bun dev server...');

  // Initial build
  await buildCommand({ ssg: false, static: options.static });

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
    const route = options.route ?? await findRoute(ctx.pagesDir);
    Bun.spawn([opener, `http://localhost:${port}${route}`]);
  }

  // Watch for file changes (pages, src, and public)
  const watchDirs = [ctx.pagesDir, ctx.srcDir, ctx.staticDir];
  const watchers: ReturnType<typeof watch>[] = [];

  let rebuildTimeout: Timer | null = null;
  let isRebuilding = false;
  const debouncedRebuild = () => {
    if (rebuildTimeout) {
      clearTimeout(rebuildTimeout);
    }
    rebuildTimeout = setTimeout(async () => {
      if (isRebuilding) return;
      isRebuilding = true;
      log.info('File change detected, rebuilding...');
      try {
        await buildCommand({ ssg: false, static: options.static });
        // Notify all connected clients to reload
        for (const client of clients) {
          client.send('reload');
        }
        log.debug('Rebuild complete, reloading browsers...');
      } catch (error) {
        log.error('Rebuild failed:', error);
      } finally {
        isRebuilding = false;
      }
    }, 100);
  };

  for (const dir of watchDirs) {
    try {
      const watcher = watch(dir, { recursive: true }, (event, filename) => {
        if (filename && !filename.startsWith('.')) {
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
