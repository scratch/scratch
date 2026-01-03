// Token management commands: list, create, delete

import { createApiClient } from '../../cloud/api';
import { ensureValidCredentials } from './auth';
import log from '../../logger';

/**
 * List all API tokens
 */
export async function listTokensCommand(): Promise<void> {
  const creds = await ensureValidCredentials();
  const api = createApiClient(creds);
  const { tokens } = await api.listTokens();

  if (tokens.length === 0) {
    log.info('No API tokens.');
    return;
  }

  log.info('API Tokens:\n');
  for (const token of tokens) {
    const name = token.name || '(unnamed)';
    const lastUsed = token.last_used_at
      ? new Date(token.last_used_at).toLocaleString()
      : 'never';
    const expires = token.expires_at
      ? new Date(token.expires_at).toLocaleDateString()
      : 'never';
    const created = new Date(token.created_at).toLocaleDateString();

    log.info(`  ${token.id}`);
    log.info(`    Name: ${name}`);
    log.info(`    Last used: ${lastUsed}`);
    log.info(`    Expires: ${expires}`);
    log.info(`    Created: ${created}`);
    log.info('');
  }
}

/**
 * Create a new API token
 */
export async function createTokenCommand(options: {
  name?: string;
  expires?: number;
}): Promise<void> {
  const creds = await ensureValidCredentials();
  const api = createApiClient(creds);
  const body: { name?: string; expires_in_days?: number } = {};
  if (options.name) body.name = options.name;
  if (options.expires) body.expires_in_days = options.expires;

  const tokenData = await api.createToken(body);

  log.info('\nCreated API token:\n');
  log.info(`  ${tokenData.token}\n`);
  if (tokenData.name) {
    log.info(`  Name: ${tokenData.name}`);
  }
  if (tokenData.expires_at) {
    log.info(`  Expires: ${new Date(tokenData.expires_at).toLocaleDateString()}`);
  }
  log.info('\nWARNING: This token will only be shown once. Save it securely.');
}

/**
 * Delete an API token
 */
export async function deleteTokenCommand(id: string): Promise<void> {
  const creds = await ensureValidCredentials();
  const api = createApiClient(creds);
  await api.deleteToken(id);

  log.info(`Token ${id} deleted.`);
}
