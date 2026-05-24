import { describe, expect, test } from 'bun:test';
import { deployCommand } from '../../../src/cmd/deploy';
import { DeployProvider, ProviderDeployContext } from '../../../src/cmd/deploy/types';

describe('deployCommand', () => {
  function createContext(overrides: Partial<ProviderDeployContext> = {}): ProviderDeployContext {
    return {
      rootDir: '/tmp/site',
      distDir: '/tmp/site/dist',
      environment: 'preview',
      project: 'my-site',
      org: undefined,
      nonInteractive: true,
      ...overrides,
    };
  }

  function createProvider(): DeployProvider {
    return {
      name: 'vercel',
      description: 'Deploy to Vercel',
      validatePrerequisites: async () => {},
      deploy: async () => ({
        project: 'my-site',
        url: 'https://my-site.vercel.app',
      }),
    };
  }

  test('returns deploy result and opens browser by default', async () => {
    let openedUrl: string | null = null;
    let printed = false;

    const result = await deployCommand('vercel', '.', {}, {
      getProvider: () => createProvider(),
      prepareDeploy: async () => createContext(),
      printDeployResult: () => {
        printed = true;
      },
      openBrowser: async (url: string) => {
        openedUrl = url;
      },
      now: (() => {
        let calls = 0;
        return () => (calls++ === 0 ? 100 : 250);
      })(),
    });

    expect(result.provider).toBe('vercel');
    expect(result.environment).toBe('preview');
    expect(result.project).toBe('my-site');
    expect(result.url).toBe('https://my-site.vercel.app');
    expect(result.duration_ms).toBe(150);
    expect(printed).toBe(true);
    expect(openedUrl).toBe('https://my-site.vercel.app');
  });

  test('skips browser open when --no-open is set', async () => {
    let opened = false;

    await deployCommand('vercel', '.', { open: false }, {
      getProvider: () => createProvider(),
      prepareDeploy: async () => createContext({ environment: 'prod' }),
      printDeployResult: () => {},
      openBrowser: async () => {
        opened = true;
      },
      now: (() => {
        let calls = 0;
        return () => (calls++ === 0 ? 0 : 10);
      })(),
    });

    expect(opened).toBe(false);
  });
});
