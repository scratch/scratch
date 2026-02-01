/**
 * Simple TOML utilities for our config format
 * We use smol-toml for parsing (via project-config.ts)
 * and this file for generating TOML with comments.
 */

/**
 * Escape a string value for TOML (handle quotes and backslashes)
 */
export function escapeTomlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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
