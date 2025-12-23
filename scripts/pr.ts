#!/usr/bin/env bun

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';

const run = (cmd: string) => {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' });
};

const runCapture = (cmd: string) => {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
};

// Check we're not on main
const currentBranch = runCapture('git branch --show-current');
if (currentBranch === 'main') {
  console.error('Error: Cannot create PR from main branch.');
  console.error('Switch to a feature branch first.');
  process.exit(1);
}

// Check for uncommitted changes (allow only PULL_REQUEST.md)
const status = runCapture('git status --porcelain');
if (status) {
  const changedFiles = status.split('\n').map(line => line.slice(3).trim());
  const allowedFiles = ['PULL_REQUEST.md'];
  const disallowedFiles = changedFiles.filter(f => !allowedFiles.includes(f));

  if (disallowedFiles.length > 0) {
    console.error('Error: You have uncommitted changes:');
    disallowedFiles.forEach(f => console.error(`  - ${f}`));
    console.error('Commit or stash these changes first.');
    process.exit(1);
  }
}

const prFilePath = path.join(import.meta.dir, '..', 'PULL_REQUEST.md');

// Check if we're in resume mode (PULL_REQUEST.md already exists)
const isResumeMode = existsSync(prFilePath);

if (isResumeMode) {
  console.log('\n==> Resuming PR creation');
  console.log('    PULL_REQUEST.md already exists.');
  console.log('    Please review and confirm to continue.');
} else {
  // Generate PR details using Claude Code CLI
  console.log('\n==> Generating pull request details with Claude...');

  const prompt = `You are generating a pull request to merge the branch "${currentBranch}" into main.

1. Read AGENTS.md to understand the project context and any PR guidelines.

2. Examine the commits and their diffs from main to this branch by running:
   git log main..HEAD -p --no-merges

3. Create a file called PULL_REQUEST.md with the following format:

---
title: <concise PR title>
---

## Summary
<1-3 bullet points describing what this PR does>

## Test plan
<bulleted checklist of how to test the changes>

PR guidelines:
- The title should be concise and descriptive (not just the branch name)
- Focus on what changed from a user's perspective
- Be specific about testing steps`;

  const claudeResult = spawnSync('claude', [
    '--print',
    '--allowedTools', 'Read,Edit,Write,Bash(git log:*)',
    '-p', prompt
  ], {
    encoding: 'utf-8',
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  if (claudeResult.status !== 0) {
    console.error('Error: Failed to generate PR details with Claude.');
    process.exit(1);
  }
}

// Read and display PULL_REQUEST.md
if (!existsSync(prFilePath)) {
  console.error('Error: PULL_REQUEST.md was not created.');
  process.exit(1);
}

const prContent = readFileSync(prFilePath, 'utf-8');

console.log('\n' + '─'.repeat(60));
console.log(prContent);
console.log('─'.repeat(60));

// Interactive prompt
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const answer = await new Promise<string>((resolve) => {
  rl.question('\nCreate pull request? (y/n): ', resolve);
});
rl.close();

if (answer.toLowerCase() !== 'y') {
  console.log('\nPR creation paused. Edit PULL_REQUEST.md as needed, then run:');
  console.log('  bun run pr');
  process.exit(0);
}

// Parse title from frontmatter
const titleMatch = prContent.match(/^---\s*\ntitle:\s*(.+)\s*\n---/);
if (!titleMatch) {
  console.error('Error: Could not parse title from PULL_REQUEST.md frontmatter.');
  console.error('Expected format:');
  console.error('---');
  console.error('title: Your PR title');
  console.error('---');
  process.exit(1);
}

const prTitle = titleMatch[1].trim();
const prBody = prContent.replace(/^---\s*\ntitle:\s*.+\s*\n---\s*\n?/, '').trim();

// Push branch if needed
console.log('\n==> Ensuring branch is pushed...');
try {
  runCapture(`git rev-parse --abbrev-ref --symbolic-full-name @{u}`);
} catch {
  // No upstream, push with -u
  run(`git push -u origin ${currentBranch}`);
}

// Create PR using gh
console.log('\n==> Creating pull request...');

// Get the repo name
const repoName = runCapture('gh repo view --json nameWithOwner -q .nameWithOwner');

// Write body to temp file for gh (handles special characters better)
const bodyFile = '/tmp/pr-body.md';
writeFileSync(bodyFile, prBody);

try {
  run(`gh pr create --repo ${repoName} --title "${prTitle.replace(/"/g, '\\"')}" --body-file ${bodyFile}`);
} finally {
  // Clean up
  unlinkSync(bodyFile);
  unlinkSync(prFilePath);
}

console.log('\n✓ Pull request created');
