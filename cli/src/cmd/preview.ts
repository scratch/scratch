import type { BuildContext } from "../build/context";
import fs from "fs/promises";
import log from "../logger";
import { openBrowser } from "../util";
import { findRoute } from "./dev";
import { startServerWithFallback } from "./server";

interface PreviewOptions {
    port?: number;
    open?: boolean;
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

    const { server, port } = await startServerWithFallback({
        buildDir: ctx.buildDir,
        port: preferredPort,
        liveReload: false,
    });

    log.info(`Preview server running at http://localhost:${port}/`);

    // Open browser if requested
    if (options.open !== false) {
        const route = await findRoute(ctx.buildDir);
        await openBrowser(`http://localhost:${port}${route}`);
    }

    // Graceful shutdown on Ctrl-C
    const shutdown = () => {
        server.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
