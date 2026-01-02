// Cloud server configuration

import { getUserConfigSync } from './userConfig';

export const CLOUD_CONFIG = {
  // Default server URL (can be overridden via user config or env)
  serverUrl:
    getUserConfigSync()?.serverUrl ||
    process.env.SCRATCH_CLOUD_URL ||
    'https://app.sndbx.sh',

  // Credentials file path
  credentialsPath: () => {
    const home = process.env.HOME || process.env.USERPROFILE || '/';
    return `${home}/.scratch/credentials.json`;
  },

  // Device flow polling
  pollInterval: 5000, // 5 seconds (matches server interval)
  pollTimeout: 900000, // 15 minutes (matches server expiry)
};
