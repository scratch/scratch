import { mkdir, writeFile, readFile, chmod } from 'fs/promises'
import { dirname } from 'path'
import { PATHS } from './paths'
import type { UserSecrets } from './types'

/**
 * Load user secrets from ~/.scratch/secrets.json
 * Includes automatic migration from old config location
 */
export async function loadUserSecrets(): Promise<UserSecrets> {
  // Try loading from new location first
  try {
    const content = await readFile(PATHS.secrets, 'utf-8')
    const data = JSON.parse(content)
    return {
      cf_access_client_id: data.cf_access_client_id,
      cf_access_client_secret: data.cf_access_client_secret,
    }
  } catch {
    // File doesn't exist or is invalid
  }

  // Migration: check old location (~/.config/scratch/config.toml)
  const migrated = await migrateFromOldConfig()
  if (migrated) {
    return migrated
  }

  return {}
}

/**
 * Save user secrets to ~/.scratch/secrets.json
 * Permissions: 0o600 (owner read/write only)
 */
export async function saveUserSecrets(secrets: UserSecrets): Promise<void> {
  await mkdir(dirname(PATHS.secrets), { recursive: true })

  const content = JSON.stringify(secrets, null, 2) + '\n'
  await writeFile(PATHS.secrets, content, { mode: 0o600 })

  // Ensure permissions are set correctly (in case file already existed)
  await chmod(PATHS.secrets, 0o600)
}

/**
 * Get Cloudflare Access credentials if configured
 * Returns null if not configured (both must be present)
 */
export async function getCfAccessCredentials(): Promise<{
  clientId: string
  clientSecret: string
} | null> {
  const secrets = await loadUserSecrets()

  if (!secrets.cf_access_client_id || !secrets.cf_access_client_secret) {
    return null
  }

  return {
    clientId: secrets.cf_access_client_id,
    clientSecret: secrets.cf_access_client_secret,
  }
}

/**
 * Save Cloudflare Access credentials
 */
export async function saveCfAccessCredentials(
  clientId: string,
  clientSecret: string
): Promise<void> {
  const secrets = await loadUserSecrets()
  secrets.cf_access_client_id = clientId
  secrets.cf_access_client_secret = clientSecret
  await saveUserSecrets(secrets)
}

/**
 * Clear Cloudflare Access credentials
 */
export async function clearCfAccessCredentials(): Promise<void> {
  const secrets = await loadUserSecrets()
  delete secrets.cf_access_client_id
  delete secrets.cf_access_client_secret
  await saveUserSecrets(secrets)
}

/**
 * Migrate CF Access credentials from old config.toml location to new secrets.json
 * Returns the migrated secrets if migration occurred, null otherwise
 */
async function migrateFromOldConfig(): Promise<UserSecrets | null> {
  try {
    const content = await readFile(PATHS.userConfig, 'utf-8')

    // Parse old config looking for CF Access fields
    let cfAccessClientId: string | undefined
    let cfAccessClientSecret: string | undefined
    const newConfigLines: string[] = []
    let foundCfAccess = false

    for (const line of content.split('\n')) {
      const trimmed = line.trim()

      // Check for CF Access fields
      const idMatch = trimmed.match(/^cf_access_client_id\s*=\s*"(.*)"\s*$/)
      if (idMatch) {
        cfAccessClientId = idMatch[1]
        foundCfAccess = true
        continue // Skip this line in new config
      }

      const secretMatch = trimmed.match(/^cf_access_client_secret\s*=\s*"(.*)"\s*$/)
      if (secretMatch) {
        cfAccessClientSecret = secretMatch[1]
        foundCfAccess = true
        continue // Skip this line in new config
      }

      // Skip comments about CF Access
      if (trimmed.startsWith('#') && trimmed.toLowerCase().includes('cloudflare access')) {
        foundCfAccess = true
        continue
      }

      newConfigLines.push(line)
    }

    // If we found CF Access credentials, migrate them
    if (cfAccessClientId && cfAccessClientSecret) {
      const secrets: UserSecrets = {
        cf_access_client_id: cfAccessClientId,
        cf_access_client_secret: cfAccessClientSecret,
      }

      // Save to new location
      await saveUserSecrets(secrets)

      // Remove from old config - clean up empty lines at end
      let newContent = newConfigLines.join('\n')
      // Remove trailing empty lines but keep one newline at end
      newContent = newContent.replace(/\n+$/, '\n')

      await writeFile(PATHS.userConfig, newContent, { mode: 0o644 })

      return secrets
    }

    // If we found CF Access comments but no valid credentials, just clean up the comments
    if (foundCfAccess) {
      let newContent = newConfigLines.join('\n')
      newContent = newContent.replace(/\n+$/, '\n')
      await writeFile(PATHS.userConfig, newContent, { mode: 0o644 })
    }
  } catch {
    // Old config doesn't exist or couldn't be read
  }

  return null
}
