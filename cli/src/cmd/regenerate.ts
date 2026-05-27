import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import log from '../logger'

interface RefreshTarget {
  file: string
  path: string
  slug: string
  prompt: string
  frontmatterBlock: string
}

export interface RegenerateOptions {
  file?: string
  dryRun?: boolean
  concurrency?: string | number
  agent?: string
  contextRoot?: string
  yolo?: boolean
}

function frontmatterBlock(source: string): string {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match?.[0] || ''
}

function isSourceFile(file: string): boolean {
  return /\.(mdx|md)$/.test(file) && !file.startsWith('index.')
}

function matchesFilter(target: RefreshTarget, filter?: string): boolean {
  if (!filter) return true
  const normalized = filter.replace(/^pages\/explainers\//, '').replace(/\.(mdx|md)$/, '')
  return target.slug === normalized || target.file === filter || target.path.endsWith(filter)
}

export async function findRegenerateTargets(projectRoot: string, filter?: string): Promise<RefreshTarget[]> {
  const explainersDir = path.join(projectRoot, 'pages', 'explainers')
  const files = await fs.readdir(explainersDir)
  const targets: RefreshTarget[] = []

  for (const file of files.filter(isSourceFile)) {
    const targetPath = path.join(explainersDir, file)
    const source = await fs.readFile(targetPath, 'utf-8')
    const block = frontmatterBlock(source)
    if (!block) continue

    const prompt = matter(source).data.prompt
    if (typeof prompt !== 'string' || !prompt.trim()) continue

    const target = {
      file,
      path: targetPath,
      slug: file.replace(/\.(mdx|md)$/, ''),
      prompt: prompt.trim(),
      frontmatterBlock: block.trimEnd(),
    }
    if (matchesFilter(target, filter)) targets.push(target)
  }

  return targets
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildPrompt(target: RefreshTarget, projectRoot: string): string {
  return `$scratch-explain ${target.prompt}

You are regenerating this existing Scratch explainer:
\`${target.path}\`

The Scratch project root is:
\`${projectRoot}\`

Return only the complete replacement MDX body for this same file.

Rules:
- Do not include YAML frontmatter.
- Do not wrap the answer in markdown fences.
- Do not edit files directly.
- Do not publish.
- Keep visible metadata components consistent with the preserved frontmatter.
- Keep imports, exports, and component usage valid for this Scratch project.
- The caller will preserve the existing frontmatter and replace only the body.

Current source path for context:
\`${target.path}\`
`
}

async function runCommand(command: string, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function runAgent(target: RefreshTarget, projectRoot: string, options: RegenerateOptions): Promise<string> {
  const scratchDir = path.join(projectRoot, '.scratch', 'regenerate')
  await fs.mkdir(scratchDir, { recursive: true })
  const promptPath = path.join(scratchDir, `${target.slug}.prompt.txt`)
  const outputPath = path.join(scratchDir, `${target.slug}.body.mdx`)
  await fs.writeFile(promptPath, buildPrompt(target, projectRoot))
  await fs.writeFile(outputPath, '')

  const agentCommand = (options.agent || process.env.SCRATCH_AGENT || process.env.AGENT || 'codex').trim()
  const isCodex = /(^|\s)codex(\s|$)/.test(agentCommand)
  const contextRoot = options.contextRoot || process.env.SCRATCH_EXPLAIN_CONTEXT_ROOT

  const command = isCodex
    ? [
        agentCommand,
        'exec',
        '--skip-git-repo-check',
        '-C',
        shellQuote(projectRoot),
        contextRoot ? `--add-dir ${shellQuote(contextRoot)}` : '',
        options.yolo ? '--dangerously-bypass-approvals-and-sandbox' : '--sandbox workspace-write',
        '-o',
        shellQuote(outputPath),
        '-',
        '<',
        shellQuote(promptPath),
      ].filter(Boolean).join(' ')
    : `${agentCommand} < ${shellQuote(promptPath)} > ${shellQuote(outputPath)}`

  const result = await runCommand(command, projectRoot)
  const body = (await fs.readFile(outputPath, 'utf-8')).trim()

  if (result.code !== 0) {
    throw new Error(`agent exited ${result.code}\n${(result.stderr || result.stdout).trim()}`)
  }
  if (!body) throw new Error('agent returned an empty body')
  if (/^---\s*$/m.test(body.slice(0, 200))) throw new Error('agent output appears to include frontmatter')
  if (target.file.endsWith('.md') && /(^|\n)\s*(import\s+[\s\S]*?\s+from\s+['"]|<Explainer|<[A-Z][A-Za-z0-9]*[\s>/])/.test(body)) {
    throw new Error('agent returned MDX/JSX for a .md file; rename the explainer to .mdx or request plain Markdown')
  }

  return body
}

async function writeBody(target: RefreshTarget, body: string): Promise<void> {
  const nextContent = `${target.frontmatterBlock}\n\n${body.trim()}\n`
  const tempPath = `${target.path}.tmp-${process.pid}`
  await fs.writeFile(tempPath, nextContent)
  await fs.rename(tempPath, target.path)
}

async function mapLimit<T>(items: T[], limit: number, mapper: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      await mapper(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function regenerateCommand(projectPath: string = '.', options: RegenerateOptions = {}): Promise<void> {
  const projectRoot = path.resolve(projectPath)
  const concurrency = Math.max(1, Math.min(5, Number(options.concurrency || 1)))
  const targets = await findRegenerateTargets(projectRoot, options.file)

  if (options.dryRun) {
    log.info(`Refreshable explainers: ${targets.length}`)
    for (const target of targets) {
      log.info(`- ${target.file}: ${target.prompt}`)
    }
    return
  }

  if (targets.length === 0) {
    throw new Error(options.file ? `No refreshable explainer found for ${options.file}` : 'No refreshable explainers found')
  }

  let refreshed = 0
  await mapLimit(targets, concurrency, async (target) => {
    log.info(`Refreshing ${target.file}...`)
    const body = await runAgent(target, projectRoot, options)
    await writeBody(target, body)
    refreshed += 1
  })

  log.info(`Refreshed ${refreshed} explainer${refreshed === 1 ? '' : 's'}`)
}
