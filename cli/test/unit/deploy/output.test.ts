import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { printDeployResult } from '../../../src/cmd/deploy/output';

describe('deploy output', () => {
  let logSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    logSpy?.mockRestore();
  });

  test('prints JSON output when requested', () => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {});

    printDeployResult(
      {
        provider: 'vercel',
        environment: 'preview',
        project: 'my-site',
        url: 'https://my-site.vercel.app',
        duration_ms: 1234,
      },
      true
    );

    expect(logSpy).toHaveBeenCalledTimes(1);
    const firstCall = logSpy.mock.calls[0]?.[0] as string;
    expect(firstCall).toContain('"provider": "vercel"');
    expect(firstCall).toContain('"duration_ms": 1234');
  });

  test('prints human-readable output when json is false', () => {
    const lines: string[] = [];
    logSpy = spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });

    printDeployResult(
      {
        provider: 'cloudflare',
        environment: 'prod',
        project: 'docs-site',
        url: 'https://docs-site.pages.dev',
        duration_ms: 5678,
      },
      false
    );

    const output = lines.join('\n');
    expect(output).toContain('Deploy complete');
    expect(output).toContain('cloudflare');
    expect(output).toContain('prod');
    expect(output).toContain('docs-site');
    expect(output).toContain('https://docs-site.pages.dev');
    expect(output).toContain('5678ms');
  });
});
