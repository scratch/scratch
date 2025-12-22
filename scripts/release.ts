#!/usr/bin/env bun

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const run = (cmd: string) => {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' });
};

const runCapture = (cmd: string) => {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
};

// Parse arguments
const args = process.argv.slice(2);
const bumpType = args[0] || 'patch';

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: bun scripts/release.ts [patch|minor|major]');
  console.error('  patch: 0.0.1 → 0.0.2 (default)');
  console.error('  minor: 0.0.1 → 0.1.0');
  console.error('  major: 0.0.1 → 1.0.0');
  process.exit(1);
}

// Check for uncommitted changes
const status = runCapture('git status --porcelain');
if (status) {
  console.error('Error: You have uncommitted changes. Commit or stash them first.');
  process.exit(1);
}

// Switch to main and pull
console.log('\n==> Switching to main branch...');
run('git checkout main');
run('git pull origin main');

// Read and bump version
const pkgPath = path.join(import.meta.dir, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

let newVersion: string;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`\n==> Bumping version: ${pkg.version} → ${newVersion}`);
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Commit version bump
console.log('\n==> Committing version bump...');
run('git add package.json');
run(`git commit -m "Release v${newVersion}"`);

// Push commit
console.log('\n==> Pushing to origin...');
run('git push origin main');

// Create and push tag
console.log(`\n==> Creating tag v${newVersion}...`);
run(`git tag v${newVersion}`);
run(`git push origin v${newVersion}`);

console.log(`\n✓ Released v${newVersion}`);
console.log(`  View release: https://github.com/scratch/scratch/releases/tag/v${newVersion}`);
