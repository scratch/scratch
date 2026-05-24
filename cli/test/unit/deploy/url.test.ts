import { describe, expect, test } from 'bun:test';
import { ensureHttpsUrl, extractUrls, pickDeployUrl, sanitizeUrl } from '../../../src/cmd/deploy/utils/url';

describe('deploy url utils', () => {
  test('extracts urls from text', () => {
    const urls = extractUrls('Deployed to https://example.com and https://foo.bar/path');
    expect(urls).toEqual(['https://example.com', 'https://foo.bar/path']);
  });

  test('picks vercel url when present', () => {
    const text = 'Done. Preview: https://my-site.vercel.app and dashboard https://vercel.com/acme';
    expect(pickDeployUrl(text, 'vercel')).toBe('https://my-site.vercel.app');
  });

  test('picks cloudflare pages url when present', () => {
    const text = 'Success! URL: https://my-site.pages.dev';
    expect(pickDeployUrl(text, 'cloudflare')).toBe('https://my-site.pages.dev');
  });

  test('sanitizes trailing punctuation', () => {
    expect(sanitizeUrl('https://example.com/path).')).toBe('https://example.com/path');
  });

  test('validates url protocol', () => {
    expect(ensureHttpsUrl('https://example.com')).toBe('https://example.com/');
    expect(() => ensureHttpsUrl('file:///tmp/foo')).toThrow(/Unsupported URL protocol/);
  });

  test('rejects unparseable urls', () => {
    expect(() => ensureHttpsUrl('not-a-url')).toThrow(/Could not parse deploy URL/);
  });

  test('falls back to first url when no provider-specific match', () => {
    const text = 'Check https://dashboard.example.com for details';
    expect(pickDeployUrl(text, 'vercel')).toBe('https://dashboard.example.com');
  });

  test('returns null when no urls found', () => {
    expect(pickDeployUrl('no urls here', 'vercel')).toBeNull();
    expect(pickDeployUrl('', 'cloudflare')).toBeNull();
  });
});
