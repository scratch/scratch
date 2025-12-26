import { watch } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createCommand } from './create';
import { devCommand } from './dev';
import { setBuildContext } from '../context';
import { bunInstall } from '../util';
import log from '../logger';

interface ViewOptions {
  port?: number;
  open?: boolean;
}

export async function viewCommand(
  filePath: string,
  options: ViewOptions = {}
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scratch-view-'));
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
    // 1. Create project in temp dir (quiet, no example content)
    await createCommand(tempDir, { src: true, package: true, example: false, quiet: true });
    log.info(`Created temp project in ${tempDir}`);

    // 2. Pre-install dependencies to avoid subprocess restart loop
    // TODO: This is slow. Consider caching a pre-installed template to skip this step.
    log.info('Installing dependencies...');
    bunInstall(tempDir);
    log.info('Dependencies installed');

    if (isDirectory) {
      // Directory: replace empty pages/ with symlink to user's directory
      await fs.rm(tempPagesDir, { recursive: true, force: true });
      await fs.symlink(absolutePath, tempPagesDir);
    } else {
      // File: copy with original name, watch for changes
      const filename = path.basename(absolutePath);
      const targetFile = path.join(tempPagesDir, filename);

      await fs.copyFile(absolutePath, targetFile);

      // Watch for changes to source file
      watch(absolutePath, async (event) => {
        if (event === 'rename') {
          log.info('Source file deleted, shutting down...');
          await cleanup();
          process.exit(0);
        } else if (event === 'change') {
          try {
            await fs.copyFile(absolutePath, targetFile);
            log.debug('File updated');
          } catch {
            // File might be mid-write, ignore
          }
        }
      });
    }

    // 3. Set build context to temp dir and run dev server
    // (dev server auto-detects the route to open)
    setBuildContext({ path: tempDir, port: options.port });
    await devCommand({
      port: options.port,
      open: options.open,
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}
