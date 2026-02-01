import path from 'path';
import log from '../logger';
import { getContentType } from '../util';
import type { ServerWebSocket, WebSocketHandler } from 'bun';

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
 * Check if a port is available by attempting to listen on it.
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

export interface ServerOptions {
  buildDir: string;
  port: number;
  maxAttempts?: number;
  liveReload?: boolean;
}

export interface ServerResult {
  server: ReturnType<typeof Bun.serve>;
  port: number;
}

// Store connected WebSocket clients for live reload
const liveReloadClients = new Set<ServerWebSocket<unknown>>();

/**
 * Notify all connected live reload clients to reload.
 */
export function notifyLiveReloadClients(): void {
  for (const client of liveReloadClients) {
    client.send('reload');
  }
}

/**
 * Inject live reload script into HTML content.
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

/**
 * Create a fetch handler for serving static files from a build directory.
 */
function createFetchHandler(
  buildDir: string,
  liveReload: boolean,
  port: number,
  server: ReturnType<typeof Bun.serve>
) {
  return async function fetch(req: Request): Promise<Response | undefined> {
    const url = new URL(req.url);
    let pathname = url.pathname;

    // Handle WebSocket upgrade for live reload
    if (liveReload && pathname === '/__live_reload') {
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
      // For HTML files, optionally inject live reload script
      if (filePath.endsWith('.html')) {
        let content = await file.text();
        if (liveReload) {
          content = injectLiveReloadScript(content, port);
        }
        return new Response(content, {
          headers: {
            'Content-Type': 'text/html',
            // Disable caching in dev mode to ensure fresh content
            ...(liveReload && { 'Cache-Control': 'no-store, no-cache, must-revalidate' }),
          },
        });
      }

      // For all other files (including binary), serve directly
      return new Response(file, {
        headers: {
          'Content-Type': getContentType(filePath),
          // Disable caching in dev mode to ensure fresh content on HMR
          ...(liveReload && { 'Cache-Control': 'no-store, no-cache, must-revalidate' }),
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  };
}

/**
 * Start a static file server with port fallback.
 * Tries the preferred port first, then increments until an available port is found.
 *
 * When liveReload is enabled, the server:
 * - Accepts WebSocket connections at /__live_reload
 * - Injects a live reload script into HTML responses
 * - Disables caching for all responses
 */
export async function startServerWithFallback(options: ServerOptions): Promise<ServerResult> {
  const { buildDir, port: preferredPort, maxAttempts = 10, liveReload = false } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = preferredPort + attempt;

    // Pre-check port availability to avoid Bun's inconsistent error handling
    if (!(await isPortAvailable(port))) {
      if (attempt === 0) {
        log.info(`Port ${port} is in use, trying ${port + 1}...`);
      } else {
        log.debug(`Port ${port} also in use, trying ${port + 1}...`);
      }
      continue;
    }

    try {
      // We need to create the server first, then create the fetch handler
      // because the fetch handler needs a reference to the server for WebSocket upgrades
      let fetchHandler: (req: Request) => Promise<Response | undefined>;

      const websocketHandler: WebSocketHandler<unknown> | undefined = liveReload
        ? {
            open(ws) {
              liveReloadClients.add(ws);
            },
            close(ws) {
              liveReloadClients.delete(ws);
            },
            message() {
              // No messages expected from client
            },
          }
        : undefined;

      const server = Bun.serve({
        port,
        fetch(req) {
          return fetchHandler(req);
        },
        ...(websocketHandler && { websocket: websocketHandler }),
      });

      // Now create the fetch handler with access to the server
      fetchHandler = createFetchHandler(buildDir, liveReload, port, server);

      return { server, port };
    } catch (error) {
      // If port is in use, try the next one
      const err = error as NodeJS.ErrnoException;
      if (
        err.code === 'EADDRINUSE' ||
        (error instanceof Error && error.message.includes('port'))
      ) {
        log.info(`Port ${port} is in use, trying ${port + 1}...`);
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
