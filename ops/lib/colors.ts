// ANSI color codes for terminal output

export const green = '\x1b[32m'
export const yellow = '\x1b[33m'
export const red = '\x1b[31m'
export const dim = '\x1b[2m'
export const reset = '\x1b[0m'

// Validation result type
export type ValidationResult = {
  passed: boolean
  message: string
}

// Create a validation result
export function check(condition: boolean, message: string): ValidationResult {
  return { passed: condition, message }
}

// Print a validation result with icon
export function printResult(result: ValidationResult): void {
  const icon = result.passed ? `${green}✓${reset}` : `${red}✗${reset}`
  console.log(`  ${icon} ${result.message}`)
}
