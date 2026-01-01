// Credential storage for cloud authentication

import fs from 'fs/promises';
import path from 'path';
import { CLOUD_CONFIG } from './config';
import type { Credentials } from './types';

/**
 * Get stored credentials, or null if not logged in
 */
export async function getCredentials(): Promise<Credentials | null> {
  try {
    const credPath = CLOUD_CONFIG.credentialsPath();
    const content = await fs.readFile(credPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save credentials to ~/.scratch/credentials.json
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
  const credPath = CLOUD_CONFIG.credentialsPath();
  const dir = path.dirname(credPath);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(credPath, JSON.stringify(credentials, null, 2) + '\n', {
    mode: 0o600, // User read/write only
  });
}

/**
 * Delete credentials (logout)
 */
export async function deleteCredentials(): Promise<void> {
  const credPath = CLOUD_CONFIG.credentialsPath();
  try {
    await fs.unlink(credPath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Ensure user is logged in, throw if not
 */
export async function requireAuth(): Promise<Credentials> {
  const creds = await getCredentials();
  if (!creds) {
    throw new Error('Not logged in. Run `scratch cloud login` first.');
  }
  return creds;
}
