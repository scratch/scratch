import { mkdir, writeFile, readFile, chmod } from 'fs/promises'
import { dirname } from 'path'
import { PATHS } from './paths'
import type { UserSecrets } from './types'

/**
 * Load user secrets from ~/.scratch/secrets.json
 * @deprecated CF Access credentials are now stored in cf-access.json keyed by server
 */
export async function loadUserSecrets(): Promise<UserSecrets> {
  try {
    const content = await readFile(PATHS.secrets, 'utf-8')
    const data = JSON.parse(content)
    return {
      cf_access_client_id: data.cf_access_client_id,
      cf_access_client_secret: data.cf_access_client_secret,
    }
  } catch {
    return {}
  }
}

/**
 * Save user secrets to ~/.scratch/secrets.json
 * Permissions: 0o600 (owner read/write only)
 * @deprecated CF Access credentials are now stored in cf-access.json keyed by server
 */
export async function saveUserSecrets(secrets: UserSecrets): Promise<void> {
  await mkdir(dirname(PATHS.secrets), { recursive: true })

  const content = JSON.stringify(secrets, null, 2) + '\n'
  await writeFile(PATHS.secrets, content, { mode: 0o600 })

  // Ensure permissions are set correctly (in case file already existed)
  await chmod(PATHS.secrets, 0o600)
}
