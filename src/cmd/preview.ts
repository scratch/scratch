import type { BuildContext } from "../build/context";
import fs from "fs/promises";
import path from "path";
import log from "../logger";
import { getContentType } from "../util";

interface PreviewOptions {
    port?: number;
    open?: boolean;
}

/**
 * Try to start a server on the given port, with fallback to subsequent ports if in use.
 */
async function startServerWithFallback(
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

                    // Serve files from build directory
                    let filePath = path.join(buildDir, pathname);

                    // Handle directory index
                    if (!pathname.includes('.')) {
                        const indexPath = path.join(filePath, 'index.html');
                        if (await Bun.file(indexPath).exists()) {
                            filePath = indexPath;
                        } else if (await Bun.file(filePath + '.html').exists()) {
                            filePath = filePath + '.html';
                        }
                    }

                    const file = Bun.file(filePath);
                    if (await file.exists()) {
                        return new Response(file, {
                            headers: {
                                'Content-Type': getContentType(filePath),
                            },
                        });
                    }

                    return new Response('Not Found', { status: 404 });
                },
            });
            return { server, port };
        } catch (error) {
            // If port is in use, try the next one
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'EADDRINUSE' || (error instanceof Error && error.message.includes('port'))) {
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
 * Serve the already-built site for local inspection using Bun.
 */
export async function previewCommand(ctx: BuildContext, options: PreviewOptions) {
    const preferredPort = typeof options.port === 'string' ? parseInt(options.port, 10) : (options.port || 4173);

    // Validate port number
    if (isNaN(preferredPort) || preferredPort < 1 || preferredPort > 65535) {
        throw new Error(`Invalid port number: "${options.port}". Port must be a number between 1 and 65535.`);
    }

    // Ensure the build directory exists and is not empty
    if (!await fs.exists(ctx.buildDir)) {
        throw new Error(`Build directory 'dist' not found. Run 'scratch build' first to generate the site.`);
    }
    if ((await fs.readdir(ctx.buildDir)).length === 0) {
        throw new Error(`Build directory 'dist' is empty. Run 'scratch build' first to generate the site.`);
    }

    const { server, port } = await startServerWithFallback(ctx.buildDir, preferredPort);

    log.info(`Preview server running at http://localhost:${port}/`);

    // Open browser if requested
    if (options.open !== false) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        Bun.spawn([opener, `http://localhost:${port}`]);
    }

    // Graceful shutdown on Ctrl-C
    const shutdown = () => {
        server.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
