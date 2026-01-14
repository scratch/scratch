import path from 'path';
import os from 'os';
import fs from 'fs/promises';

/**
 * Create a temporary directory for test artifacts and return its path.
 * Uses the OS temp directory to keep the repo clean.
 */
export async function mkTempDir(prefix: string) {
  const baseDir = path.join(os.tmpdir(), 'scratch-test');
  await fs.mkdir(baseDir, { recursive: true });

  return await fs.mkdtemp(path.join(baseDir, prefix));
}
