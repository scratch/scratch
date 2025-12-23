#!/usr/bin/env bun

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
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

// Check for uncommitted changes (allow only CHANGELOG.md and package.json)
const status = runCapture('git status --porcelain');
if (status) {
  const changedFiles = status.split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      // Git porcelain format: XY PATH (2 status chars + optional space + path)
      const match = line.match(/^.{2}\s*(.+)$/);
      return match ? match[1].trim() : '';
    })
    .filter(f => f.length > 0);
  const allowedFiles = ['CHANGELOG.md', 'package.json'];
  const disallowedFiles = changedFiles.filter(f => !allowedFiles.includes(f));

  if (disallowedFiles.length > 0) {
    console.error('Error: You have uncommitted changes in files other than CHANGELOG.md and package.json:');
    disallowedFiles.forEach(f => console.error(`  - ${f}`));
    console.error('Commit or stash these changes first.');
    process.exit(1);
  }
}

// Switch to main and pull (only if clean or only release files modified)
const currentBranch = runCapture('git branch --show-current');
if (currentBranch !== 'main') {
  if (status) {
    console.error('Error: Cannot switch branches with uncommitted changes.');
    console.error('Please commit or stash your changes, or run from the main branch.');
    process.exit(1);
  }
  console.log('\n==> Switching to main branch...');
  run('git checkout main');
}

// Only pull if we don't have local changes
if (!status) {
  console.log('\n==> Pulling latest changes...');
  run('git pull origin main');
}

// Read current version and calculate new version
const pkgPath = path.join(import.meta.dir, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

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

const lastTag = `v${currentVersion}`;
const changelogPath = path.join(import.meta.dir, '..', 'CHANGELOG.md');

// Check if we're in resume mode (CHANGELOG already has entry for new version)
let isResumeMode = false;
let existingChangelog = '';
if (existsSync(changelogPath)) {
  existingChangelog = readFileSync(changelogPath, 'utf-8');
  isResumeMode = existingChangelog.includes(`## [${newVersion}]`);
}

if (isResumeMode) {
  console.log(`\n==> Resuming release v${newVersion}`);
  console.log('    CHANGELOG.md already has an entry for this version.');
  console.log('    Please review and confirm to continue.');
} else {
  // Generate release notes using Claude Code CLI
  console.log('\n==> Generating release notes with Claude...');

  const date = new Date().toISOString().split('T')[0];
  const prompt = `You are generating release notes for version ${newVersion} (date: ${date}) of this project.

1. Read AGENTS.md to understand the project context and any release notes guidelines.

2. Examine the commits and their diffs since the last release (${lastTag}) by running:
   git log ${lastTag}..HEAD -p --no-merges

3. Add a new entry to CHANGELOG.md with the header "## [${newVersion}] - ${date}" followed by the release notes. Insert it after the "# Changelog" header and before any existing entries.

Release notes guidelines:
- Start with a brief 1-2 sentence summary of what's in this release
- Group changes into categories if there are enough (Features, Bug Fixes, Improvements, etc.)
- Focus on what changed from a user's perspective, not implementation details
- Use clear, concise language
- Do NOT include commit hashes`;

  const claudeResult = spawnSync('claude', [
    '--print',
    '--allowedTools', 'Read,Edit,Bash(git log:*)',
    '-p', prompt
  ], {
    encoding: 'utf-8',
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  if (claudeResult.status !== 0) {
    console.error('Error: Failed to generate release notes with Claude.');
    process.exit(1);
  }

  // Update package.json version (without staging)
  console.log(`\n==> Updating version: ${currentVersion} → ${newVersion}`);
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Re-read changelog for display
  existingChangelog = readFileSync(changelogPath, 'utf-8');
}

// Extract and display the new changelog entry
const versionHeaderRegex = new RegExp(`## \\[${newVersion}\\][^\n]*\n`);
const match = existingChangelog.match(versionHeaderRegex);
if (match) {
  const startIdx = existingChangelog.indexOf(match[0]);
  const restContent = existingChangelog.slice(startIdx + match[0].length);
  const nextVersionIdx = restContent.search(/^## \[/m);
  const entryContent = nextVersionIdx === -1 ? restContent.trim() : restContent.slice(0, nextVersionIdx).trim();

  console.log('\n' + '─'.repeat(60));
  console.log(`## [${newVersion}]`);
  console.log('─'.repeat(60));
  console.log(entryContent);
  console.log('─'.repeat(60));
}

// Interactive prompt
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const answer = await new Promise<string>((resolve) => {
  rl.question('\nContinue with release? (y/n): ', resolve);
});
rl.close();

if (answer.toLowerCase() !== 'y') {
  console.log('\nRelease paused. Edit CHANGELOG.md as needed, then run:');
  console.log(`  bun run release:${bumpType}`);
  process.exit(0);
}

// Stage, commit, and continue with release
console.log('\n==> Committing changes...');
run('git add package.json CHANGELOG.md');
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
