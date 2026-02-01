import { mkdir, writeFile, readFile, chmod } from 'fs/promises'
import { dirname } from 'path'

/**
 * Load a JSON file from disk, returning a default value if it doesn't exist or is invalid.
 * Used for credential and configuration files that store object data.
 *
 * @param path - Absolute path to the JSON file
 * @param defaultValue - Value to return if file doesn't exist or is invalid (defaults to empty object)
 * @returns The parsed JSON data or the default value
 */
export async function loadSecureJsonFile<T extends object>(
  path: string,
  defaultValue: T = {} as T
): Promise<T> {
  try {
    const content = await readFile(path, 'utf-8')
    const data = JSON.parse(content)
    // Basic validation - should be an object (not null, not array)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return defaultValue
    }
    return data as T
  } catch {
    return defaultValue
  }
}

/**
 * Save data to a JSON file with secure permissions (0o600 - owner read/write only).
 * Creates parent directories if they don't exist.
 *
 * @param path - Absolute path to the JSON file
 * @param data - The data to save (will be JSON-stringified with 2-space indentation)
 */
export async function saveSecureJsonFile<T>(path: string, data: T): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  // Set permissions explicitly in case the file already existed with different permissions
  await chmod(path, 0o600)
}
