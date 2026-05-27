import fs from 'fs/promises'
import path from 'path'
import { PATHS } from './paths'

export interface ProjectIndexEntry {
  path: string
  name: string
  updated_at: string
  id?: string
  server_url?: string
}

export interface ProjectIndexFile {
  projects: ProjectIndexEntry[]
}

function normalizeProjectPath(projectPath: string): string {
  return path.resolve(projectPath)
}

function defaultProjectName(projectPath: string): string {
  return path.basename(normalizeProjectPath(projectPath))
}

export async function loadProjectsIndex(indexPath: string = PATHS.projects): Promise<ProjectIndexFile> {
  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!parsed || !Array.isArray(parsed.projects)) return { projects: [] }

    return {
      projects: parsed.projects
        .filter((entry: any) => typeof entry?.path === 'string')
        .map((entry: any) => ({
          path: normalizeProjectPath(entry.path),
          name: typeof entry.name === 'string' && entry.name ? entry.name : defaultProjectName(entry.path),
          updated_at: typeof entry.updated_at === 'string' ? entry.updated_at : new Date(0).toISOString(),
          id: typeof entry.id === 'string' ? entry.id : undefined,
          server_url: typeof entry.server_url === 'string' ? entry.server_url : undefined,
        })),
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { projects: [] }
    throw error
  }
}

export async function saveProjectsIndex(index: ProjectIndexFile, indexPath: string = PATHS.projects): Promise<void> {
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  const tempPath = `${indexPath}.tmp-${process.pid}`
  await fs.writeFile(tempPath, JSON.stringify(index, null, 2) + '\n', { mode: 0o600 })
  await fs.rename(tempPath, indexPath)
  await fs.chmod(indexPath, 0o600)
}

export async function upsertProjectIndexEntry(
  projectPath: string,
  updates: Partial<Omit<ProjectIndexEntry, 'path' | 'updated_at'>> = {},
  indexPath: string = PATHS.projects
): Promise<ProjectIndexEntry> {
  const resolvedPath = normalizeProjectPath(projectPath)
  const index = await loadProjectsIndex(indexPath)
  const existing = index.projects.find((entry) => entry.path === resolvedPath)
  const entry: ProjectIndexEntry = {
    ...existing,
    ...updates,
    path: resolvedPath,
    name: updates.name || existing?.name || defaultProjectName(resolvedPath),
    updated_at: new Date().toISOString(),
  }

  const nextProjects = index.projects.filter((item) => item.path !== resolvedPath)
  nextProjects.push(entry)
  nextProjects.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
  await saveProjectsIndex({ projects: nextProjects }, indexPath)
  return entry
}

export async function resolveIndexedProject(
  selector?: string,
  cwd: string = process.cwd(),
  indexPath: string = PATHS.projects
): Promise<ProjectIndexEntry | null> {
  const index = await loadProjectsIndex(indexPath)
  if (selector) {
    const resolvedSelector = normalizeProjectPath(selector)
    return index.projects.find((entry) => entry.path === resolvedSelector || entry.name === selector) || null
  }

  const resolvedCwd = normalizeProjectPath(cwd)
  const containing = index.projects
    .filter((entry) => resolvedCwd === entry.path || resolvedCwd.startsWith(entry.path + path.sep))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (containing) return containing

  if (index.projects.length === 1) return index.projects[0]
  return null
}
