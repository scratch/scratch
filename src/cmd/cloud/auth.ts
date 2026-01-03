// Authentication commands: login, logout, whoami

import { createApiClient } from '../../cloud/api';
import type { Credentials } from '../../cloud/types';
import {
  saveCredentials,
  deleteCredentials,
  getCredentials,
} from '../../cloud/credentials';
import { CLOUD_CONFIG } from '../../cloud/config';
import log from '../../logger';

/**
 * Ensure user has valid credentials, triggering login if needed.
 * Validates token with server and auto-re-logins if expired.
 */
export async function ensureValidCredentials(): Promise<Credentials> {
  let creds = await getCredentials();

  if (creds) {
    // Validate token with server
    const api = createApiClient(creds);
    try {
      await api.me();
      return creds; // Token is valid
    } catch {
      // Token expired/invalid - clear and re-login
      log.info('Session expired. Starting new login...\n');
      await deleteCredentials();
      creds = null;
    }
  }

  // No credentials or invalid - start login flow
  if (!creds) {
    await loginCommand();
    creds = await getCredentials();
    if (!creds) {
      throw new Error('Login required');
    }
  }

  return creds;
}

/**
 * Login via device flow
 */
export async function loginCommand(): Promise<void> {
  log.debug(`[Auth] Server URL: ${CLOUD_CONFIG.serverUrl}`);

  // Check if already logged in and token is still valid
  const existing = await getCredentials();
  if (existing) {
    const api = createApiClient(existing);
    try {
      await api.me();
      log.info(`Already logged in as ${existing.user.email}`);
      log.info('Run `scratch cloud logout` first to log in as a different user.');
      return;
    } catch {
      // Token expired/invalid - clear and proceed with login
      log.info('Session expired. Starting new login...\n');
      await deleteCredentials();
    }
  }

  const api = createApiClient();

  // Initiate device flow
  log.info('Logging in to Scratch Cloud...');
  const deviceFlow = await api.initiateDeviceFlow();
  log.debug(`[Auth] Device flow initiated:`, deviceFlow);

  log.info('');
  log.info(`Your code: ${deviceFlow.user_code}`);
  log.info('');
  log.info(`Opening browser to: ${deviceFlow.verification_url}`);
  log.info('');

  // Open browser
  const openCommand =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

  try {
    const proc = Bun.spawn([openCommand, deviceFlow.verification_url], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    await proc.exited;
  } catch {
    log.info('Could not open browser automatically.');
    log.info(`Please visit: ${deviceFlow.verification_url}`);
  }

  log.info('Waiting for authorization...');

  // Poll for approval
  const pollInterval = (deviceFlow.interval || 5) * 1000;
  const expiresAt = Date.now() + deviceFlow.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    log.debug(`[Auth] Polling for token...`);
    const result = await api.pollDeviceToken(deviceFlow.device_code);
    log.debug(`[Auth] Poll result: ${result.status}`);

    if (result.status === 'approved' && result.token && result.user) {
      // Save credentials
      await saveCredentials({
        token: result.token,
        user: result.user,
        server: CLOUD_CONFIG.serverUrl,
      });

      log.info('');
      log.info(`Logged in as ${result.user.email}`);
      return;
    }

    if (result.status === 'denied') {
      throw new Error('Authorization was denied');
    }

    if (result.status === 'expired') {
      throw new Error('Authorization expired. Please try again.');
    }

    // status === 'pending', continue polling
  }

  throw new Error('Authorization timed out. Please try again.');
}

/**
 * Logout - clear stored credentials
 */
export async function logoutCommand(): Promise<void> {
  await deleteCredentials();
  log.info('Logged out successfully.');
}

/**
 * Show current user info
 */
export async function whoamiCommand(): Promise<void> {
  const creds = await ensureValidCredentials();
  log.info(`Logged in as: ${creds.user.email}`);
  log.info(`Organization: ${creds.user.org}`);
  log.info(`Server: ${creds.server}`);
}
