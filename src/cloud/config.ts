import { homedir } from 'os'
import { join } from 'path'

// Re-export getServerUrl from user-config
export { getServerUrl } from './user-config'

// Credentials file location
export const CREDENTIALS_PATH = join(homedir(), '.scratch', 'credentials.json')
