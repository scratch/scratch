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
  port?: string;
  open?: boolean;
}

export async function viewCommand(filePath: string, options: ViewOptions = {}): Promise<void> {
  // Resolve absolute path to the file
  const absoluteFilePath = path.resolve(filePath);

  // Verify file exists
  if (!await fs.exists(absoluteFilePath)) {
    log.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Determine target extension (.md or .mdx)
  const ext = path.extname(absoluteFilePath);
  const targetExt = ext === '.mdx' ? '.mdx' : '.md';

  // Create temp directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scratch-view-'));
  const targetFile = path.join(tempDir, 'pages', `index${targetExt}`);

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
    await createCommand(tempDir, { src: true, package: true });

    // 2. Pre-install dependencies to avoid subprocess restart loop
    // (BuildContext.restartBuildInSubprocess would re-run 'scratch view' and create infinite loop)
    log.info('Installing dependencies...');
    bunInstall(tempDir);
    log.info('Dependencies installed');

    // 3. Copy file to pages/index.md(x)
    await fs.copyFile(absoluteFilePath, targetFile);

    // 4. Watch for changes to source file
    const watcher = watch(absoluteFilePath, async (event) => {
      if (event === 'rename') {
        // File was deleted or renamed
        log.info('Source file deleted, shutting down...');
        watcher.close();
        await cleanup();
        process.exit(0);
      } else if (event === 'change') {
        // File was modified, copy it
        try {
          await fs.copyFile(absoluteFilePath, targetFile);
          log.debug('File updated');
        } catch {
          // File might be mid-write, ignore
        }
      }
    });

    // 5. Set build context to temp dir and run dev server
    setBuildContext({ path: tempDir, port: options.port });
    await devCommand({
      port: options.port ? parseInt(options.port, 10) : undefined,
      open: options.open
    });

  } catch (error) {
    await cleanup();
    throw error;
  }
}
