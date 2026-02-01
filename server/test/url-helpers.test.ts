import { describe, test, expect } from 'bun:test'
import { errorRedirectUrl, buildLocalhostCallbackUrl } from '../src/lib/url-helpers'

describe('errorRedirectUrl', () => {
  test('encodes simple message', () => {
    const result = errorRedirectUrl('Something went wrong')
    expect(result).toBe('/error?message=Something%20went%20wrong')
  })

  test('encodes special characters', () => {
    const result = errorRedirectUrl('Error: "test" & <script>')
    expect(result).toBe('/error?message=Error%3A%20%22test%22%20%26%20%3Cscript%3E')
  })

  test('encodes unicode characters', () => {
    const result = errorRedirectUrl('Error: cafe')
    expect(result).toBe('/error?message=Error%3A%20cafe')
  })

  test('handles empty message', () => {
    const result = errorRedirectUrl('')
    expect(result).toBe('/error?message=')
  })

  test('encodes query-like strings properly', () => {
    const result = errorRedirectUrl('param=value&other=123')
    expect(result).toBe('/error?message=param%3Dvalue%26other%3D123')
  })
})

describe('buildLocalhostCallbackUrl', () => {
  test('builds URL with port only', () => {
    const result = buildLocalhostCallbackUrl(8400)
    expect(result).toBe('http://localhost:8400/callback')
  })

  test('builds URL with single param', () => {
    const result = buildLocalhostCallbackUrl(8400, { token: 'abc123' })
    expect(result).toBe('http://localhost:8400/callback?token=abc123')
  })

  test('builds URL with multiple params', () => {
    const result = buildLocalhostCallbackUrl(8400, {
      token: 'abc123',
      state: 'xyz789',
    })
    // URL searchParams order is deterministic (insertion order)
    expect(result).toBe('http://localhost:8400/callback?token=abc123&state=xyz789')
  })

  test('encodes special characters in params', () => {
    const result = buildLocalhostCallbackUrl(8400, {
      token: 'abc=123&def',
      state: 'test value',
    })
    expect(result).toBe('http://localhost:8400/callback?token=abc%3D123%26def&state=test+value')
  })

  test('handles different port numbers', () => {
    const result = buildLocalhostCallbackUrl(3000, { callback: 'test' })
    expect(result).toBe('http://localhost:3000/callback?callback=test')
  })

  test('handles empty params object', () => {
    const result = buildLocalhostCallbackUrl(8400, {})
    expect(result).toBe('http://localhost:8400/callback')
  })

  test('handles cf_token param', () => {
    const result = buildLocalhostCallbackUrl(8400, {
      token: 'session123',
      state: 'mystate',
      cf_token: 'eyJhbGciOiJIUzI1NiJ9.test',
    })
    expect(result).toContain('token=session123')
    expect(result).toContain('state=mystate')
    expect(result).toContain('cf_token=eyJhbGciOiJIUzI1NiJ9.test')
  })

  test('handles error param for denial flow', () => {
    const result = buildLocalhostCallbackUrl(8400, {
      state: 'mystate',
      error: 'access_denied',
    })
    expect(result).toBe('http://localhost:8400/callback?state=mystate&error=access_denied')
  })
})
