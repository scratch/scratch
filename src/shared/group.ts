// Group validation
// Shared between server and CLI

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN_REGEX = /^@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i

/**
 * Validate raw input string format.
 * Returns error message if invalid, null if valid.
 */
export function validateGroupInput(value: string): string | null {
  if (value === 'public' || value === 'private') {
    return null
  }

  // Handle comma-separated list
  if (value.includes(',')) {
    const parts = value.split(',').map((s) => s.trim())
    for (const part of parts) {
      const error = validateSingleMember(part)
      if (error) return error
    }
    return null
  }

  // Single value
  return validateSingleMember(value)
}

function validateSingleMember(value: string): string | null {
  if (value.startsWith('@')) {
    if (!DOMAIN_REGEX.test(value)) {
      return 'Invalid domain format. Use @domain.com'
    }
    return null
  }

  if (value.includes('@')) {
    if (!EMAIL_REGEX.test(value)) {
      return `Invalid email format: ${value}`
    }
    return null
  }

  return 'Invalid format. Use "public", "private", "@domain.com", or email addresses'
}
