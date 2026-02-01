// Terminal output utilities - ANSI colors and status printing

// ANSI color codes
export const green = '\x1b[32m'
export const yellow = '\x1b[33m'
export const red = '\x1b[31m'
export const dim = '\x1b[2m'
export const reset = '\x1b[0m'

/**
 * Print a status line with a checkmark or X icon
 * @param passed - Whether the status represents success (true) or failure (false)
 * @param message - The message to display after the icon
 */
export function printStatus(passed: boolean, message: string): void {
  const icon = passed ? `${green}✓${reset}` : `${red}✗${reset}`
  console.log(`  ${icon} ${message}`)
}
