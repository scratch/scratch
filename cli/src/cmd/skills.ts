import fs from 'fs/promises'
import path from 'path'
import log from '../logger'
import { loadProjectsIndex, resolveIndexedProject } from '../config'
import { renderScratchExplainSkill } from '../skills/scratch-explain'

export interface SkillsOptions {
  project?: string
}

async function isScratchProject(projectPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(projectPath, 'pages'))
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function resolveProjectPath(options: SkillsOptions, cwd: string): Promise<string> {
  if (options.project) {
    const explicit = await resolveIndexedProject(options.project, cwd)
    return explicit?.path || path.resolve(options.project)
  }

  let current = path.resolve(cwd)
  while (true) {
    if (await isScratchProject(current)) return current
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  const indexed = await loadProjectsIndex()
  if (indexed.projects.length === 1) return indexed.projects[0]!.path
  return '{{PROJECT_PATH}}'
}

export async function skillsCommand(options: SkillsOptions = {}, cwd: string = process.cwd()): Promise<void> {
  const projectPath = await resolveProjectPath(options, cwd)
  const skillDir = path.join(cwd, '.agents', 'skills', 'scratch-explain')
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), renderScratchExplainSkill(projectPath))

  log.info(`Installed scratch-explain skill in ${path.relative(cwd, skillDir) || skillDir}`)
  if (projectPath === '{{PROJECT_PATH}}') {
    log.info('Edit SKILL.md and replace {{PROJECT_PATH}} with the Scratch project path.')
  } else {
    log.info(`Scratch project: ${projectPath}`)
  }
}
