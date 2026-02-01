import { describe, test, expect } from 'bun:test'
import { buildCacheBaseUrlsFromOptions, type CacheUrlOptions } from '../src/lib/cache'

// Helper to create default cache options
function createOptions(overrides: Partial<CacheUrlOptions> = {}): CacheUrlOptions {
  return {
    contentBaseUrl: 'https://pages.example.com',
    userId: 'user-123',
    email: 'alice@example.com',
    projectName: 'my-project',
    singleDomain: null,
    ...overrides,
  }
}

describe('buildCacheBaseUrlsFromOptions', () => {
  describe('public deployment (multi-domain)', () => {
    test('generates URLs for user ID and email', () => {
      const options = createOptions({ singleDomain: null })

      const urls = buildCacheBaseUrlsFromOptions(options)

      expect(urls).toEqual([
        'https://pages.example.com/user-123/my-project',
        'https://pages.example.com/alice@example.com/my-project',
      ])
    })

    test('lowercases email in URL', () => {
      const options = createOptions({
        email: 'Alice@Example.COM',
        singleDomain: null,
      })

      const urls = buildCacheBaseUrlsFromOptions(options)

      expect(urls).toContain('https://pages.example.com/alice@example.com/my-project')
    })
  })

  describe('single-domain deployment', () => {
    test('includes local-part URL when singleDomain is set', () => {
      const options = createOptions({
        email: 'alice@acme.com',
        singleDomain: 'acme.com',
      })

      const urls = buildCacheBaseUrlsFromOptions(options)

      expect(urls).toEqual([
        'https://pages.example.com/user-123/my-project',
        'https://pages.example.com/alice@acme.com/my-project',
        'https://pages.example.com/alice/my-project',
      ])
    })

    test('extracts local part correctly for complex emails', () => {
      const options = createOptions({
        email: 'John.Doe@company.org',
        singleDomain: 'company.org',
      })

      const urls = buildCacheBaseUrlsFromOptions(options)

      // Local part should be lowercased
      expect(urls).toContain('https://pages.example.com/john.doe/my-project')
    })
  })

  describe('localhost development', () => {
    test('uses http protocol when contentBaseUrl specifies http', () => {
      const options = createOptions({
        contentBaseUrl: 'http://pages.localhost:8788',
      })

      const urls = buildCacheBaseUrlsFromOptions(options)

      expect(urls[0]).toStartWith('http://pages.localhost:8788/')
    })
  })

  describe('different project names', () => {
    test('includes project name in all URLs', () => {
      const options = createOptions({
        projectName: 'docs-site',
        email: 'bob@test.com',
        singleDomain: 'test.com',
      })

      const urls = buildCacheBaseUrlsFromOptions(options)

      urls.forEach((url) => {
        expect(url).toContain('/docs-site')
      })
    })
  })

  describe('edge cases', () => {
    test('handles user ID with special characters', () => {
      const options = createOptions({
        userId: 'user_abc-123',
      })

      const urls = buildCacheBaseUrlsFromOptions(options)

      expect(urls[0]).toBe('https://pages.example.com/user_abc-123/my-project')
    })

    test('handles email with plus sign', () => {
      const options = createOptions({
        email: 'alice+test@example.com',
        singleDomain: 'example.com',
      })

      const urls = buildCacheBaseUrlsFromOptions(options)

      expect(urls).toContain('https://pages.example.com/alice+test@example.com/my-project')
      expect(urls).toContain('https://pages.example.com/alice+test/my-project')
    })
  })
})
