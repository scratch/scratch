// Authentication commands: login, logout, whoami

import { createApiClient } from '../../cloud/api';
import {
  saveCredentials,
  deleteCredentials,
  getCredentials,
} from '../../cloud/credentials';
import { CLOUD_CONFIG } from '../../cloud/config';
import log from '../../logger';

/**
 * Login via device flow
 */
export async function loginCommand(): Promise<void> {
  // Check if already logged in
  const existing = await getCredentials();
  if (existing) {
    log.info(`Already logged in as ${existing.user.email}`);
    log.info('Run `scratch cloud logout` first to log in as a different user.');
    return;
  }

  const api = createApiClient();

  // Initiate device flow
  log.info('Logging in to Scratch Cloud...');
  const deviceFlow = await api.initiateDeviceFlow();

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

    const result = await api.pollDeviceToken(deviceFlow.device_code);

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
  const creds = await getCredentials();

  if (!creds) {
    log.info('Not logged in. Run `scratch cloud login` to authenticate.');
    return;
  }

  // Verify token is still valid
  const api = createApiClient(creds);
  try {
    const { user } = await api.me();
    log.info(`Logged in as: ${user.email}`);
    log.info(`Organization: ${user.org}`);
    log.info(`Server: ${creds.server}`);
  } catch {
    log.error(
      'Session expired or invalid. Please run `scratch cloud login` again.'
    );
    await deleteCredentials();
  }
}
