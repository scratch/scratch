import { describe, expect, test } from 'bun:test';
import { runCliCapture } from './util';

describe('deploy command help', () => {
  test('top-level help includes deploy command', () => {
    const result = runCliCapture(['--help'], '.');
    expect(result.stdout).toContain('deploy');
    expect(result.stdout).toContain('Deploy dist/ to an external provider');
  });

  test('deploy help shows provider argument', () => {
    const result = runCliCapture(['deploy', '--help'], '.');
    expect(result.stdout).toContain('<provider>');
    expect(result.stdout).toContain('Provider name (vercel, cloudflare)');
  });

  test('deploy help shows all expected flags', () => {
    const result = runCliCapture(['deploy', 'vercel', '--help'], '.');
    expect(result.stdout).toContain('--prod');
    expect(result.stdout).toContain('--preview');
    expect(result.stdout).toContain('--project <name>');
    expect(result.stdout).toContain('--org <name>');
    expect(result.stdout).toContain('--yes');
    expect(result.stdout).toContain('--no-build');
    expect(result.stdout).toContain('--no-open');
    expect(result.stdout).toContain('--json');
  });
});
