import { z } from 'zod'

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN_REGEX = /^@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i

// A single member specification: email or @domain
const memberSchema = z.string().refine(
  (s) => EMAIL_REGEX.test(s) || DOMAIN_REGEX.test(s),
  'Must be @domain.com or email@example.com'
)

// Group - a set of users
// "public" | "private" | "@domain.com" | "user@x.com" | ["@domain.com", "user@x.com", ...]
export const groupSchema = z.union([
  z.literal('public'),
  z.literal('private'),
  memberSchema,
  z.array(memberSchema).min(1),
])
export type Group = z.infer<typeof groupSchema>

/**
 * Check if an email belongs to a group.
 * - public: always true
 * - private: always false (ownership checked separately)
 * - email/domain list: true if email matches any entry
 */
export function matchesGroup(email: string, group: Group): boolean {
  if (group === 'public') return true
  if (group === 'private') return false

  const emailLower = email.toLowerCase()

  // Single member (string)
  if (typeof group === 'string') {
    return memberMatches(emailLower, group)
  }

  // Array of members
  return group.some((member) => memberMatches(emailLower, member))
}

/**
 * Check if an email matches a single member specification (email or @domain)
 */
function memberMatches(emailLower: string, member: string): boolean {
  if (member.startsWith('@')) {
    // Domain match - case-insensitive
    const domainLower = member.toLowerCase()
    return emailLower.endsWith(domainLower)
  }
  // Exact email match - case-insensitive
  return emailLower === member.toLowerCase()
}

/**
 * Parse a string specification into a Group.
 * Handles: "public", "private", "@domain.com", "a@x.com,b@y.com,@acme.com"
 */
export function parseGroup(value: string): Group {
  if (value === 'public') return 'public'
  if (value === 'private') return 'private'

  // Single domain
  if (value.startsWith('@') && !value.includes(',')) {
    return value
  }

  // Comma-separated list
  if (value.includes(',')) {
    return value.split(',').map((s) => s.trim())
  }

  // Single email
  if (value.includes('@')) {
    return value
  }

  // Fallback to public (matches old behavior)
  return 'public'
}

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

/**
 * Check if group A contains group B.
 * Returns true if every member of B would also be a member of A.
 *
 * - public contains everything
 * - private contains only private
 * - For domain/email lists: A contains B if every domain or email in B is allowed by A
 *
 * Used to enforce ceilings (e.g., project visibility must be contained by MAX_VISIBILITY).
 */
export function groupContains(a: Group, b: Group): boolean {
  // public contains everything
  if (a === 'public') return true

  // private only contains private
  if (a === 'private') return b === 'private'

  // If b is public, only public can contain it
  if (b === 'public') return false

  // If b is private, anything contains it (private is most restrictive)
  if (b === 'private') return true

  // Both a and b are member specifications (string or array)
  const aMembers = Array.isArray(a) ? a : [a]
  const bMembers = Array.isArray(b) ? b : [b]

  // Every member in B must be contained by A
  return bMembers.every((bMember) => memberIsContainedBy(bMember, aMembers))
}

/**
 * Check if a single member specification is contained by a list of member specifications.
 *
 * A domain @x.com is only contained if:
 * - A includes the exact same domain @x.com
 * - A includes a parent domain that would match all emails from @x.com
 *
 * An email user@x.com is contained if:
 * - A includes the exact email user@x.com
 * - A includes a domain @x.com that matches the email
 */
function memberIsContainedBy(bMember: string, aMembers: string[]): boolean {
  const bMemberLower = bMember.toLowerCase()

  // If bMember is a domain, we need either:
  // - Same exact domain in A
  // - We cannot have an email list contain a domain (email list is more restrictive)
  if (bMember.startsWith('@')) {
    return aMembers.some((aMember) => {
      if (!aMember.startsWith('@')) return false // Emails can't contain domains
      return aMember.toLowerCase() === bMemberLower
    })
  }

  // bMember is an email - check if any A member contains it
  return aMembers.some((aMember) => {
    const aMemberLower = aMember.toLowerCase()
    if (aMember.startsWith('@')) {
      // Domain in A - check if email matches domain
      return bMemberLower.endsWith(aMemberLower)
    }
    // Exact email match
    return aMemberLower === bMemberLower
  })
}
