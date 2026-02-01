import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import { run, runCapture } from '../lib/process'

export type Component = 'cli' | 'server'
export type BumpType = 'patch' | 'minor' | 'major'

interface ComponentConfig {
  name: string
  packageJsonPath: string
  changelogPath: string
  tagPrefix: string
  claudeMdPath: string
}

const COMPONENT_CONFIGS: Record<Component, ComponentConfig> = {
  cli: {
    name: 'CLI',
    packageJsonPath: 'cli/package.json',
    changelogPath: 'cli/CHANGELOG.md',
    tagPrefix: 'cli-v',
    claudeMdPath: 'cli/CLAUDE.md',
  },
  server: {
    name: 'Server',
    packageJsonPath: 'server/package.json',
    changelogPath: 'server/CHANGELOG.md',
    tagPrefix: 'server-v',
    claudeMdPath: 'CLAUDE.md',
  },
}

export async function runRelease(component: Component, bumpType: BumpType): Promise<void> {
  const config = COMPONENT_CONFIGS[component]
  const rootDir = process.cwd()

  const pkgPath = path.join(rootDir, config.packageJsonPath)
  const changelogPath = path.join(rootDir, config.changelogPath)
  const claudeMdPath = path.join(rootDir, config.claudeMdPath)

  // Check for uncommitted changes (allow only CHANGELOG.md and package.json for this component)
  const status = runCapture('git status --porcelain')
  if (status) {
    const changedFiles = status.split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const match = line.match(/^.{2}\s*(.+)$/)
        return match ? match[1].trim() : ''
      })
      .filter(f => f.length > 0)

    const allowedFiles = [config.changelogPath, config.packageJsonPath, 'bun.lock']
    const disallowedFiles = changedFiles.filter(f => !allowedFiles.includes(f))

    if (disallowedFiles.length > 0) {
      console.error(`Error: You have uncommitted changes in files other than ${config.name} release files:`)
      disallowedFiles.forEach(f => console.error(`  - ${f}`))
      console.error('Commit or stash these changes first.')
      process.exit(1)
    }
  }

  // Switch to main and pull (only if clean or only release files modified)
  const currentBranch = runCapture('git branch --show-current')
  if (currentBranch !== 'main') {
    if (status) {
      console.error('Error: Cannot switch branches with uncommitted changes.')
      console.error('Please commit or stash your changes, or run from the main branch.')
      process.exit(1)
    }
    console.log('\n==> Switching to main branch...')
    run('git checkout main')
  }

  // Only pull if we don't have local changes
  if (!status) {
    console.log('\n==> Pulling latest changes...')
    run('git pull origin main')
  }

  // Read current version and calculate new version
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const currentVersion = pkg.version

  if (!currentVersion) {
    console.error(`Error: No version field found in ${config.packageJsonPath}`)
    console.error('Add a "version" field to package.json first.')
    process.exit(1)
  }

  const [major, minor, patch] = currentVersion.split('.').map(Number)

  let newVersion: string
  switch (bumpType) {
    case 'major':
      newVersion = `${major + 1}.0.0`
      break
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`
      break
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`
      break
  }

  const lastTag = `${config.tagPrefix}${currentVersion}`
  const newTag = `${config.tagPrefix}${newVersion}`

  // Check if last tag exists (for first release, we may not have a tag)
  let tagExists = false
  try {
    runCapture(`git rev-parse ${lastTag}`)
    tagExists = true
  } catch {
    console.log(`Note: Previous tag ${lastTag} not found. This may be the first release with the new tag format.`)
  }

  // Check if we're in resume mode (CHANGELOG already has entry for new version)
  let isResumeMode = false
  let existingChangelog = ''
  if (existsSync(changelogPath)) {
    existingChangelog = readFileSync(changelogPath, 'utf-8')
    isResumeMode = existingChangelog.includes(`## [${newVersion}]`)
  }

  if (isResumeMode) {
    console.log(`\n==> Resuming ${config.name} release v${newVersion}`)
    console.log('    CHANGELOG.md already has an entry for this version.')
    console.log('    Please review and confirm to continue.')
  } else {
    // Generate release notes using Claude Code CLI
    console.log(`\n==> Generating ${config.name} release notes with Claude...`)

    const date = new Date().toISOString().split('T')[0]
    const gitLogRange = tagExists ? `${lastTag}..HEAD` : 'HEAD~20..HEAD'
    const gitLogNote = tagExists
      ? `since the last release (${lastTag})`
      : '(recent commits - no previous tag found)'

    const prompt = `You are generating release notes for ${config.name} version ${newVersion} (date: ${date}).

1. Read ${config.claudeMdPath} to understand the project context and any release notes guidelines.

2. Examine the commits and their diffs ${gitLogNote} by running:
   git log ${gitLogRange} -p --no-merges -- ${component === 'cli' ? 'cli/' : 'server/ shared/'}

3. Add a new entry to ${config.changelogPath} with the header "## [${newVersion}] - ${date}" followed by the release notes. Insert it after the "# Changelog" header and before any existing entries.

Release notes guidelines:
- Start with a brief 1-2 sentence summary of what's in this release
- Group changes into categories if there are enough (Features, Bug Fixes, Improvements, etc.)
- Focus on what changed from a user's perspective, not implementation details
- Use clear, concise language
- Do NOT include commit hashes`

    const claudeResult = spawnSync('claude', [
      '--print',
      '--allowedTools', 'Read,Edit,Bash(git log:*)',
      '-p', prompt
    ], {
      encoding: 'utf-8',
      stdio: ['inherit', 'inherit', 'inherit'],
    })

    if (claudeResult.status !== 0) {
      console.error('Error: Failed to generate release notes with Claude.')
      process.exit(1)
    }

    // Verify that CHANGELOG.md was actually updated
    const updatedChangelog = readFileSync(changelogPath, 'utf-8')
    if (!updatedChangelog.includes(`## [${newVersion}]`)) {
      console.error('Error: Claude did not update CHANGELOG.md with the new version entry.')
      console.error('Please run the release script again or manually add the changelog entry.')
      process.exit(1)
    }

    // Update package.json version (without staging)
    console.log(`\n==> Updating version: ${currentVersion} → ${newVersion}`)
    pkg.version = newVersion
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

    // Re-read changelog for display
    existingChangelog = readFileSync(changelogPath, 'utf-8')
  }

  // Extract and display the new changelog entry
  const versionHeaderRegex = new RegExp(`## \\[${newVersion}\\][^\n]*\n`)
  const match = existingChangelog.match(versionHeaderRegex)
  if (match) {
    const startIdx = existingChangelog.indexOf(match[0])
    const restContent = existingChangelog.slice(startIdx + match[0].length)
    const nextVersionIdx = restContent.search(/^## \[/m)
    const entryContent = nextVersionIdx === -1 ? restContent.trim() : restContent.slice(0, nextVersionIdx).trim()

    console.log('\n' + '─'.repeat(60))
    console.log(`## [${newVersion}]`)
    console.log('─'.repeat(60))
    console.log(entryContent)
    console.log('─'.repeat(60))
  }

  // Interactive prompt
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question('\nContinue with release? (Y/n): ', resolve)
  })
  rl.close()

  if (answer.toLowerCase() === 'n') {
    console.log(`\nRelease paused. Edit ${config.changelogPath} as needed, then run:`)
    console.log(`  bun ops ${component} release ${bumpType}`)
    process.exit(0)
  }

  // Stage, commit, and continue with release
  console.log('\n==> Committing changes...')
  run(['git', 'add', config.packageJsonPath, config.changelogPath, 'bun.lock'])
  run(['git', 'commit', '-m', `Release ${config.name} v${newVersion}`])

  // Push commit
  console.log('\n==> Pushing to origin...')
  run('git push origin main')

  // Create and push tag
  console.log(`\n==> Creating tag ${newTag}...`)
  run(['git', 'tag', newTag])
  run(['git', 'push', 'origin', newTag])

  console.log(`\n✓ Released ${config.name} v${newVersion}`)
  console.log(`  Tag: ${newTag}`)
}
