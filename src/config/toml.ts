/**
 * Simple TOML utilities for our config format
 * We use a lightweight parser to avoid heavy dependencies
 */

/**
 * Escape a string value for TOML (handle quotes and backslashes)
 */
export function escapeTomlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Parse a simple TOML file with string values only
 * Supports: key = "value" format with # comments
 */
export function parseTOML<T extends Record<string, string | undefined>>(
  content: string,
  knownKeys: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {}
  const keySet = new Set(knownKeys as string[])

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^(\w+)\s*=\s*"(.*)"\s*$/)
    if (match) {
      const [, key, value] = match
      if (keySet.has(key)) {
        ;(result as Record<string, string>)[key] = value
      }
    }
  }

  return result
}

export interface TomlField {
  key: string
  value?: string
  comment?: string
}

/**
 * Generate a TOML file with comments
 */
export function generateTOML(fields: TomlField[], header?: string[]): string {
  const lines: string[] = []

  if (header) {
    lines.push(...header, '')
  }

  for (const field of fields) {
    if (field.comment) {
      lines.push(`# ${field.comment}`)
    }
    if (field.value !== undefined) {
      lines.push(`${field.key} = "${escapeTomlString(field.value)}"`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
