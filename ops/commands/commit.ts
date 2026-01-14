import { Command } from 'commander'
import { execSync } from 'child_process'
import { createInterface } from 'readline'
import Anthropic from '@anthropic-ai/sdk'

const runCapture = (cmd: string) => {
  return execSync(cmd, { encoding: 'utf-8' }).trim()
}

const run = (cmd: string) => {
  console.log(`$ ${cmd}`)
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' })
}

async function runCommit(): Promise<void> {
  // Check for changes
  const status = runCapture('git status --porcelain')
  if (!status) {
    console.log('No changes to commit.')
    process.exit(0)
  }

  // Stage all changes
  console.log('==> Staging all changes...')
  run('git add -A')

  // Get the diff of staged changes
  const diff = runCapture('git diff --cached')
  if (!diff) {
    console.log('No staged changes to commit.')
    process.exit(0)
  }

  // Get list of changed files for context
  const files = runCapture('git diff --cached --name-only')

  console.log('\n==> Generating commit message with Claude Haiku...')

  const client = new Anthropic()

  const prompt = `Generate a brief, conventional commit message for these changes.

Rules:
- Use conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore
- Keep the first line under 72 characters
- Be specific but concise
- Don't include file names unless essential for understanding
- Output ONLY the commit message, nothing else

Files changed:
${files}

Diff:
${diff.slice(0, 15000)}${diff.length > 15000 ? '\n... (truncated)' : ''}`

  const message = await client.messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  })

  const commitMessage = (message.content[0] as { type: 'text'; text: string }).text.trim()

  console.log('\n' + '─'.repeat(60))
  console.log(commitMessage)
  console.log('─'.repeat(60))

  // Interactive prompt
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question('\nCommit with this message? (Y/n/e to edit): ', resolve)
  })
  rl.close()

  let finalMessage = commitMessage

  if (answer.toLowerCase() === 'n') {
    console.log('\nCommit cancelled. Changes remain staged.')
    process.exit(0)
  } else if (answer.toLowerCase() === 'e') {
    // Let user edit the message
    const rl2 = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    finalMessage = await new Promise<string>((resolve) => {
      rl2.question('Enter commit message: ', resolve)
    })
    rl2.close()

    if (!finalMessage.trim()) {
      console.log('\nEmpty message. Commit cancelled.')
      process.exit(0)
    }
  }

  // Commit
  console.log('\n==> Committing...')
  execSync(`git commit -m "${finalMessage.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
    stdio: 'inherit'
  })

  console.log('\n✓ Committed')
}

export function registerCommitCommand(program: Command): void {
  program
    .command('commit')
    .description('Commit all changes with AI-generated message')
    .action(async () => {
      await runCommit()
    })
}
