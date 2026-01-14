import { describe, expect, test } from 'bun:test'
import {
  matchesGroup,
  parseGroup,
  validateGroupInput,
  groupContains,
  groupSchema,
} from './group'

describe('matchesGroup', () => {
  describe('public group', () => {
    test('returns true for any email', () => {
      expect(matchesGroup('user@acme.com', 'public')).toBe(true)
      expect(matchesGroup('anyone@anywhere.org', 'public')).toBe(true)
    })
  })

  describe('private group', () => {
    test('returns false for any email', () => {
      expect(matchesGroup('user@acme.com', 'private')).toBe(false)
      expect(matchesGroup('admin@company.com', 'private')).toBe(false)
    })
  })

  describe('domain group', () => {
    test('returns true for email matching domain', () => {
      expect(matchesGroup('user@acme.com', '@acme.com')).toBe(true)
      expect(matchesGroup('admin@acme.com', '@acme.com')).toBe(true)
    })

    test('returns false for email not matching domain', () => {
      expect(matchesGroup('user@other.com', '@acme.com')).toBe(false)
      expect(matchesGroup('user@acme.org', '@acme.com')).toBe(false)
    })

    test('is case-insensitive for domain matching', () => {
      expect(matchesGroup('user@ACME.COM', '@acme.com')).toBe(true)
      expect(matchesGroup('user@acme.com', '@ACME.COM')).toBe(true)
      expect(matchesGroup('USER@Acme.Com', '@acme.com')).toBe(true)
    })
  })

  describe('single email group', () => {
    test('returns true for exact email match', () => {
      expect(matchesGroup('user@example.com', 'user@example.com')).toBe(true)
    })

    test('returns false for non-matching email', () => {
      expect(matchesGroup('other@example.com', 'user@example.com')).toBe(false)
    })

    test('is case-insensitive for email matching', () => {
      expect(matchesGroup('USER@EXAMPLE.COM', 'user@example.com')).toBe(true)
      expect(matchesGroup('user@example.com', 'USER@EXAMPLE.COM')).toBe(true)
    })
  })

  describe('array group (mixed emails and domains)', () => {
    test('returns true if email matches any domain in array', () => {
      expect(matchesGroup('user@acme.com', ['@acme.com', '@other.com'])).toBe(true)
      expect(matchesGroup('user@other.com', ['@acme.com', '@other.com'])).toBe(true)
    })

    test('returns true if email matches specific email in array', () => {
      expect(matchesGroup('guest@external.com', ['@acme.com', 'guest@external.com'])).toBe(true)
    })

    test('returns false if email matches nothing in array', () => {
      expect(matchesGroup('hacker@evil.com', ['@acme.com', 'guest@external.com'])).toBe(false)
    })

    test('handles mixed array with case-insensitivity', () => {
      expect(matchesGroup('USER@ACME.COM', ['@acme.com', 'specific@user.com'])).toBe(true)
      expect(matchesGroup('SPECIFIC@USER.COM', ['@acme.com', 'specific@user.com'])).toBe(true)
    })
  })
})

describe('parseGroup', () => {
  test('parses "public" to public', () => {
    expect(parseGroup('public')).toBe('public')
  })

  test('parses "private" to private', () => {
    expect(parseGroup('private')).toBe('private')
  })

  test('parses domain string to domain', () => {
    expect(parseGroup('@acme.com')).toBe('@acme.com')
  })

  test('parses single email to string', () => {
    expect(parseGroup('user@example.com')).toBe('user@example.com')
  })

  test('parses comma-separated emails to array', () => {
    expect(parseGroup('a@x.com,b@y.com')).toEqual(['a@x.com', 'b@y.com'])
  })

  test('parses mixed comma-separated domains and emails', () => {
    expect(parseGroup('@acme.com,guest@other.com')).toEqual(['@acme.com', 'guest@other.com'])
  })

  test('trims whitespace in comma-separated values', () => {
    expect(parseGroup('a@x.com, b@y.com , c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com'])
  })

  test('falls back to public for unknown format', () => {
    expect(parseGroup('unknown')).toBe('public')
  })

  test('falls back to public for empty string', () => {
    expect(parseGroup('')).toBe('public')
  })
})

describe('validateGroupInput', () => {
  test('accepts "public"', () => {
    expect(validateGroupInput('public')).toBeNull()
  })

  test('accepts "private"', () => {
    expect(validateGroupInput('private')).toBeNull()
  })

  test('accepts valid domain', () => {
    expect(validateGroupInput('@acme.com')).toBeNull()
    expect(validateGroupInput('@sub.domain.com')).toBeNull()
  })

  test('rejects invalid domain format', () => {
    expect(validateGroupInput('@com')).not.toBeNull()
    expect(validateGroupInput('@')).not.toBeNull()
    expect(validateGroupInput('domain.com')).not.toBeNull() // Missing @
  })

  test('accepts valid email', () => {
    expect(validateGroupInput('user@example.com')).toBeNull()
  })

  test('rejects invalid email format', () => {
    expect(validateGroupInput('user@')).not.toBeNull()
    expect(validateGroupInput('notanemail')).not.toBeNull()
    expect(validateGroupInput('user')).not.toBeNull()
  })

  test('accepts @domain.com as valid domain (not email)', () => {
    // @domain.com is valid - it's a domain restriction, not an invalid email
    expect(validateGroupInput('@example.com')).toBeNull()
  })

  test('accepts comma-separated emails', () => {
    expect(validateGroupInput('a@x.com,b@y.com')).toBeNull()
  })

  test('accepts mixed comma-separated domains and emails', () => {
    expect(validateGroupInput('@acme.com,guest@other.com')).toBeNull()
  })

  test('rejects if any item in comma-separated list is invalid', () => {
    expect(validateGroupInput('valid@email.com,invalid')).not.toBeNull()
    expect(validateGroupInput('@valid.com,@')).not.toBeNull()
  })

  test('rejects empty or invalid strings', () => {
    expect(validateGroupInput('')).not.toBeNull()
    expect(validateGroupInput('random')).not.toBeNull()
  })
})

describe('groupContains', () => {
  describe('public group', () => {
    test('contains everything', () => {
      expect(groupContains('public', 'public')).toBe(true)
      expect(groupContains('public', 'private')).toBe(true)
      expect(groupContains('public', '@acme.com')).toBe(true)
      expect(groupContains('public', 'user@x.com')).toBe(true)
      expect(groupContains('public', ['@acme.com', 'guest@x.com'])).toBe(true)
    })
  })

  describe('private group', () => {
    test('contains only private', () => {
      expect(groupContains('private', 'private')).toBe(true)
    })

    test('does not contain anything else', () => {
      expect(groupContains('private', 'public')).toBe(false)
      expect(groupContains('private', '@acme.com')).toBe(false)
      expect(groupContains('private', 'user@x.com')).toBe(false)
      expect(groupContains('private', ['a@x.com'])).toBe(false)
    })
  })

  describe('domain group', () => {
    test('contains same domain', () => {
      expect(groupContains('@acme.com', '@acme.com')).toBe(true)
    })

    test('contains email from same domain', () => {
      expect(groupContains('@acme.com', 'user@acme.com')).toBe(true)
    })

    test('contains array of emails all from same domain', () => {
      expect(groupContains('@acme.com', ['a@acme.com', 'b@acme.com'])).toBe(true)
    })

    test('does not contain different domain', () => {
      expect(groupContains('@acme.com', '@other.com')).toBe(false)
    })

    test('does not contain email from different domain', () => {
      expect(groupContains('@acme.com', 'user@other.com')).toBe(false)
    })

    test('does not contain array with email from different domain', () => {
      expect(groupContains('@acme.com', ['a@acme.com', 'b@other.com'])).toBe(false)
    })

    test('does not contain public', () => {
      expect(groupContains('@acme.com', 'public')).toBe(false)
    })

    test('contains private', () => {
      expect(groupContains('@acme.com', 'private')).toBe(true)
    })
  })

  describe('email group', () => {
    test('contains same email', () => {
      expect(groupContains('user@x.com', 'user@x.com')).toBe(true)
    })

    test('does not contain different email', () => {
      expect(groupContains('user@x.com', 'other@x.com')).toBe(false)
    })

    test('does not contain entire domain', () => {
      expect(groupContains('user@x.com', '@x.com')).toBe(false)
    })

    test('does not contain public', () => {
      expect(groupContains('user@x.com', 'public')).toBe(false)
    })

    test('contains private', () => {
      expect(groupContains('user@x.com', 'private')).toBe(true)
    })
  })

  describe('array group', () => {
    test('contains single item that is in array', () => {
      expect(groupContains(['@acme.com', '@other.com'], '@acme.com')).toBe(true)
      expect(groupContains(['a@x.com', 'b@y.com'], 'a@x.com')).toBe(true)
    })

    test('contains email covered by domain in array', () => {
      expect(groupContains(['@acme.com', 'guest@external.com'], 'user@acme.com')).toBe(true)
      expect(groupContains(['@acme.com', 'guest@external.com'], 'guest@external.com')).toBe(true)
    })

    test('contains array that is subset', () => {
      expect(groupContains(['a@x.com', 'b@y.com'], ['a@x.com', 'b@y.com'])).toBe(true)
      expect(groupContains(['a@x.com', 'b@y.com', 'c@z.com'], ['a@x.com', 'b@y.com'])).toBe(true)
    })

    test('does not contain array that is not subset', () => {
      expect(groupContains(['a@x.com'], ['a@x.com', 'b@y.com'])).toBe(false)
    })

    test('does not contain domain not in array', () => {
      expect(groupContains(['@acme.com', '@other.com'], '@third.com')).toBe(false)
    })

    test('does not contain public', () => {
      expect(groupContains(['@acme.com', 'guest@x.com'], 'public')).toBe(false)
    })

    test('contains private', () => {
      expect(groupContains(['@acme.com', 'guest@x.com'], 'private')).toBe(true)
    })

    test('email list does not contain domain (even if all current emails are from that domain)', () => {
      // This is important: ['a@x.com', 'b@x.com'] does NOT contain @x.com
      // because @x.com would allow c@x.com which is not in the list
      expect(groupContains(['a@x.com', 'b@x.com'], '@x.com')).toBe(false)
    })
  })

  describe('case insensitivity', () => {
    test('domain containment is case-insensitive', () => {
      expect(groupContains('@ACME.COM', '@acme.com')).toBe(true)
      expect(groupContains('@acme.com', 'USER@ACME.COM')).toBe(true)
    })

    test('email containment is case-insensitive', () => {
      expect(groupContains('USER@X.COM', 'user@x.com')).toBe(true)
      expect(groupContains(['a@x.com'], ['A@X.COM'])).toBe(true)
    })
  })
})

describe('groupSchema', () => {
  test('accepts public', () => {
    expect(() => groupSchema.parse('public')).not.toThrow()
  })

  test('accepts private', () => {
    expect(() => groupSchema.parse('private')).not.toThrow()
  })

  test('accepts valid domain', () => {
    expect(() => groupSchema.parse('@acme.com')).not.toThrow()
  })

  test('accepts valid email', () => {
    expect(() => groupSchema.parse('user@example.com')).not.toThrow()
  })

  test('accepts array of valid members', () => {
    expect(() => groupSchema.parse(['@acme.com', 'user@x.com'])).not.toThrow()
  })

  test('rejects empty array', () => {
    expect(() => groupSchema.parse([])).toThrow()
  })

  test('rejects array with invalid member', () => {
    expect(() => groupSchema.parse(['valid@email.com', 'invalid'])).toThrow()
  })
})
