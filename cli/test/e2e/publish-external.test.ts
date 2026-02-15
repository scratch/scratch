import { describe, expect, test } from 'bun:test';
import { runCliCapture } from './util';

describe('publish --to help', () => {
  test('top-level help includes publish command', () => {
    const result = runCliCapture(['--help'], '.');
    expect(result.stdout).toContain('publish');
    expect(result.stdout).toContain('Build and publish project');
  });

  test('publish help shows --to option', () => {
    const result = runCliCapture(['publish', '--help'], '.');
    expect(result.stdout).toContain('--to <provider>');
    expect(result.stdout).toContain('vercel');
    expect(result.stdout).toContain('cloudflare');
  });

  test('publish help shows external hosting flags', () => {
    const result = runCliCapture(['publish', '--help'], '.');
    expect(result.stdout).toContain('--prod');
    expect(result.stdout).toContain('--preview');
    expect(result.stdout).toContain('--project <name>');
    expect(result.stdout).toContain('--org <name>');
    expect(result.stdout).toContain('--yes');
    expect(result.stdout).toContain('--no-build');
    expect(result.stdout).toContain('--no-open');
    expect(result.stdout).toContain('--json');
  });

  test('deploy command no longer exists', () => {
    const result = runCliCapture(['--help'], '.');
    expect(result.stdout).not.toContain('deploy');
  });
});
