import { describe, expect, test } from 'bun:test'
import {
  validateProjectName,
  getEmailLocalPart,
  getEmailDomain,
  isSingleDomainAllowedUsers,
  buildProjectUrls,
  parsePagePath,
} from './project'

describe('validateProjectName', () => {
  test('accepts valid names', () => {
    expect(validateProjectName('my-app').valid).toBe(true)
    expect(validateProjectName('myapp').valid).toBe(true)
    expect(validateProjectName('app123').valid).toBe(true)
    expect(validateProjectName('my-cool-app').valid).toBe(true)
  })

  test('rejects names starting with number', () => {
    expect(validateProjectName('123app').valid).toBe(false)
  })

  test('rejects names with uppercase', () => {
    expect(validateProjectName('MyApp').valid).toBe(false)
  })

  test('rejects names shorter than 3 chars', () => {
    expect(validateProjectName('ab').valid).toBe(false)
  })

  test('rejects reserved names', () => {
    expect(validateProjectName('api').valid).toBe(false)
    expect(validateProjectName('admin').valid).toBe(false)
  })
})

describe('getEmailLocalPart', () => {
  test('extracts local part from email', () => {
    expect(getEmailLocalPart('pete@mydomain.com')).toBe('pete')
    expect(getEmailLocalPart('Alice@Example.com')).toBe('alice')
  })

  test('handles emails with dots in local part', () => {
    expect(getEmailLocalPart('pete.smith@mydomain.com')).toBe('pete.smith')
  })

  test('returns null for invalid emails', () => {
    expect(getEmailLocalPart('notanemail')).toBe(null)
    expect(getEmailLocalPart('')).toBe(null)
  })
})

describe('getEmailDomain', () => {
  test('extracts domain from email', () => {
    expect(getEmailDomain('pete@mydomain.com')).toBe('mydomain.com')
    expect(getEmailDomain('Pete@MyDomain.COM')).toBe('mydomain.com')
  })

  test('returns null for invalid emails', () => {
    expect(getEmailDomain('notanemail')).toBe(null)
    expect(getEmailDomain('')).toBe(null)
  })
})

describe('isSingleDomainAllowedUsers', () => {
  test('returns domain for single domain pattern', () => {
    expect(isSingleDomainAllowedUsers('@mydomain.com')).toBe('mydomain.com')
    expect(isSingleDomainAllowedUsers('@MyDomain.COM')).toBe('mydomain.com')
  })

  test('handles whitespace', () => {
    expect(isSingleDomainAllowedUsers('  @mydomain.com  ')).toBe('mydomain.com')
  })

  test('returns null for multiple domains', () => {
    expect(isSingleDomainAllowedUsers('@domain1.com,@domain2.com')).toBe(null)
  })

  test('returns null for email list', () => {
    expect(isSingleDomainAllowedUsers('user@domain.com')).toBe(null)
  })

  test('returns null for empty string', () => {
    expect(isSingleDomainAllowedUsers('')).toBe(null)
  })

  test('returns null for *', () => {
    expect(isSingleDomainAllowedUsers('*')).toBe(null)
  })
})

describe('buildProjectUrls', () => {
  test('uses local part when single domain allowed', () => {
    const urls = buildProjectUrls({
      pagesDomain: 'pages.example.com',
      projectName: 'my-app',
      ownerId: 'user123',
      ownerEmail: 'pete@mydomain.com',
      allowedUsers: '@mydomain.com',
    })

    expect(urls.primary).toBe('https://pages.example.com/pete/my-app/')
    expect(urls.byId).toBe('https://pages.example.com/user123/my-app/')
  })

  test('uses full email when multiple domains allowed', () => {
    const urls = buildProjectUrls({
      pagesDomain: 'pages.example.com',
      projectName: 'my-app',
      ownerId: 'user123',
      ownerEmail: 'pete@mydomain.com',
      allowedUsers: '*',
    })

    expect(urls.primary).toBe('https://pages.example.com/pete@mydomain.com/my-app/')
    expect(urls.byId).toBe('https://pages.example.com/user123/my-app/')
  })

  test('uses http for localhost', () => {
    const urls = buildProjectUrls({
      pagesDomain: 'localhost:8787',
      projectName: 'my-app',
      ownerId: 'user123',
      ownerEmail: 'pete@mydomain.com',
      allowedUsers: '@mydomain.com',
    })

    expect(urls.primary).toBe('http://localhost:8787/pete/my-app/')
    expect(urls.byId).toBe('http://localhost:8787/user123/my-app/')
  })
})

describe('parsePagePath', () => {
  test('parses path with file', () => {
    const parsed = parsePagePath('/pete/my-app/index.html')
    expect(parsed).toEqual({
      ownerIdentifier: 'pete',
      projectName: 'my-app',
      filePath: 'index.html',
    })
  })

  test('parses path without file', () => {
    const parsed = parsePagePath('/pete/my-app/')
    expect(parsed).toEqual({
      ownerIdentifier: 'pete',
      projectName: 'my-app',
      filePath: '',
    })
  })

  test('parses path with nested file', () => {
    const parsed = parsePagePath('/user123/my-app/assets/css/style.css')
    expect(parsed).toEqual({
      ownerIdentifier: 'user123',
      projectName: 'my-app',
      filePath: 'assets/css/style.css',
    })
  })

  test('returns null for invalid paths', () => {
    expect(parsePagePath('/')).toBe(null)
    expect(parsePagePath('/only-one')).toBe(null)
    expect(parsePagePath('')).toBe(null)
  })
})
