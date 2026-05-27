import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'

export interface ExplainerMetadata {
  title: string
  description: string
  date: string
  href: string
  published: boolean | null
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return ''
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function isExplainerSource(file: string): boolean {
  return /\.(mdx|md)$/.test(file) && !file.startsWith('index.')
}

export async function collectExplainerMetadata(projectRoot: string): Promise<ExplainerMetadata[]> {
  const explainersDir = path.join(projectRoot, 'pages', 'explainers')
  if (!(await exists(explainersDir))) return []

  const files = (await fs.readdir(explainersDir)).filter(isExplainerSource)
  const explainers = await Promise.all(files.map(async (file) => {
    const slug = file.replace(/\.(mdx|md)$/, '')
    const source = await fs.readFile(path.join(explainersDir, file), 'utf-8')
    const metadata = matter(source).data

    return {
      title: typeof metadata.title === 'string' && metadata.title ? metadata.title : titleFromSlug(slug),
      description: stringValue(metadata.description),
      date: stringValue(metadata.date),
      href: `./${slug}/`,
      published: typeof metadata.published === 'boolean' ? metadata.published : null,
    }
  }))

  return explainers.sort((first, second) => {
    const firstDate = first.date || '0000-00-00'
    const secondDate = second.date || '0000-00-00'
    return secondDate.localeCompare(firstDate) || first.title.localeCompare(second.title)
  })
}

export async function generateExplainerData(projectRoot: string): Promise<ExplainerMetadata[]> {
  const explainers = await collectExplainerMetadata(projectRoot)
  const generatedDir = path.join(projectRoot, '.scratch', 'generated')
  const outputPath = path.join(generatedDir, 'explainerData.ts')
  const generated = `export type Explainer = {
  title: string;
  description: string;
  date: string;
  href: string;
  published: boolean | null;
};

export const explainers: Explainer[] = ${JSON.stringify(explainers, null, 2)};
`

  await fs.mkdir(generatedDir, { recursive: true })
  await fs.writeFile(outputPath, generated)
  return explainers
}

async function removeIfPresent(targetPath: string): Promise<boolean> {
  if (!(await exists(targetPath))) return false
  await fs.rm(targetPath, { recursive: true, force: true })
  return true
}

export async function pruneUnpublishedExplainers(projectRoot: string, distDir?: string): Promise<string[]> {
  const explainersDir = path.join(projectRoot, 'pages', 'explainers')
  const distExplainersDir = path.join(distDir || path.join(projectRoot, 'dist'), 'explainers')
  if (!(await exists(explainersDir)) || !(await exists(distExplainersDir))) return []

  const removedSlugs: string[] = []
  const files = (await fs.readdir(explainersDir)).filter(isExplainerSource)

  for (const file of files) {
    const slug = file.replace(/\.(mdx|md)$/, '')
    const source = await fs.readFile(path.join(explainersDir, file), 'utf-8')
    const { data } = matter(source)
    if (data.published === true) continue

    const removed = await Promise.all([
      removeIfPresent(path.join(distExplainersDir, slug)),
      removeIfPresent(path.join(distExplainersDir, `${slug}.md`)),
    ])
    if (removed.some(Boolean)) removedSlugs.push(slug)
  }

  return removedSlugs
}
