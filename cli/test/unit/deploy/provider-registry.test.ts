import { describe, expect, test } from 'bun:test';
import { getProvider, listProviders } from '../../../src/cmd/deploy/provider-registry';

describe('deploy provider registry', () => {
  test('lists supported providers', () => {
    expect(listProviders()).toEqual(['vercel', 'cloudflare']);
  });

  test('resolves vercel provider', () => {
    const provider = getProvider('vercel');
    expect(provider.name).toBe('vercel');
  });

  test('resolves cloudflare aliases', () => {
    expect(getProvider('cloudflare').name).toBe('cloudflare');
    expect(getProvider('cloudflare-pages').name).toBe('cloudflare');
    expect(getProvider('cf').name).toBe('cloudflare');
  });

  test('throws for unsupported providers', () => {
    expect(() => getProvider('netlify')).toThrow(/Unsupported provider/);
  });
});
