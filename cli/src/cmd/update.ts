import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import log from '../logger';
import { VERSION, GITHUB_API } from '../version';

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

interface Checksums {
  [platform: string]: string;
}

/**
 * Get the platform identifier for the current system.
 */
export function getPlatform(): string {
  const os = process.platform;
  const arch = process.arch;

  if (os === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  } else if (os === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }

  throw new Error(`Unsupported platform: ${os}-${arch}`);
}

/**
 * Compare two semver versions.
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Fetch the latest release info from GitHub.
 */
async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(`${GITHUB_API}/releases/latest`);
  if (!response.ok) {
    throw new Error(`Failed to fetch latest release: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Download a file and return its path.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const fileStream = createWriteStream(destPath);
  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
  await pipeline(nodeStream, fileStream);
}

/**
 * Calculate SHA256 hash of a file.
 */
async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get the path to the current executable.
 */
function getExecutablePath(): string {
  // When compiled with bun, process.execPath is the executable itself
  return process.execPath;
}

/**
 * Update scratch to the latest version.
 */
export async function updateCommand(): Promise<void> {
  const platform = getPlatform();
  log.info(`Current version: ${VERSION}`);
  log.info(`Platform: ${platform}`);

  // Fetch latest release
  log.info('Checking for updates...');
  const release = await fetchLatestRelease();
  const latestVersion = release.tag_name.replace(/^v/, '');

  if (compareVersions(latestVersion, VERSION) <= 0) {
    log.info(`Already up to date (${VERSION})`);
    return;
  }

  log.info(`New version available: ${latestVersion}`);

  // Find the binary asset for this platform
  const binaryName = `scratch-${platform}`;
  const binaryAsset = release.assets.find(a => a.name === binaryName);
  if (!binaryAsset) {
    throw new Error(`No binary found for platform: ${platform}`);
  }

  // Find checksums asset
  const checksumsAsset = release.assets.find(a => a.name === 'checksums.json');

  // Download to temp directory
  const tempDir = path.join(process.env.HOME || '/tmp', '.local', 'scratch-downloads');
  await fs.mkdir(tempDir, { recursive: true });

  const tempBinaryPath = path.join(tempDir, binaryName);
  log.info(`Downloading ${binaryName}...`);
  await downloadFile(binaryAsset.browser_download_url, tempBinaryPath);

  // Verify checksum if available
  if (checksumsAsset) {
    log.info('Verifying checksum...');
    const checksumsPath = path.join(tempDir, 'checksums.json');
    await downloadFile(checksumsAsset.browser_download_url, checksumsPath);

    const checksums: Checksums = JSON.parse(await fs.readFile(checksumsPath, 'utf-8'));
    const expectedHash = checksums[platform];

    if (expectedHash) {
      const actualHash = await hashFile(tempBinaryPath);
      if (actualHash !== expectedHash) {
        await fs.unlink(tempBinaryPath);
        throw new Error(`Checksum mismatch! Expected ${expectedHash}, got ${actualHash}`);
      }
      log.info('Checksum verified');
    }
  }

  // Make executable
  await fs.chmod(tempBinaryPath, 0o755);

  // Replace current executable
  const execPath = getExecutablePath();
  log.info(`Replacing ${execPath}...`);

  // Backup current executable
  const backupPath = `${execPath}.backup`;
  try {
    await fs.copyFile(execPath, backupPath);
  } catch {
    // Ignore backup errors
  }

  // Replace executable
  try {
    await fs.rename(tempBinaryPath, execPath);
  } catch (e) {
    // If rename fails (cross-device), try copy + delete
    await fs.copyFile(tempBinaryPath, execPath);
    await fs.unlink(tempBinaryPath);
  }

  // Clean up backup
  try {
    await fs.unlink(backupPath);
  } catch {
    // Ignore cleanup errors
  }

  log.info(`Updated to ${latestVersion}`);
}
