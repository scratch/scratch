import { homedir } from 'os'
import { join } from 'path'

// Server URL - can be overridden via environment variable
export const SERVER_URL = process.env.SCRATCH_SERVER_URL || 'https://app.scratch.dev'

// Credentials file location
export const CREDENTIALS_PATH = join(homedir(), '.scratch', 'credentials.json')
