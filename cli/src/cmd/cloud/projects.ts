import log from '../../logger'
import { loadProjectConfig } from '../../config'
import { listProjects, getProject, deleteProject, ApiError } from '../../cloud/api'
import { prompt, select, stripTrailingSlash } from '../../util'
import { CloudContext } from './context'

// Prompt user to select from multiple projects
export async function promptProjectChoice(
  projects: { name: string; urls: { primary: string } }[]
): Promise<string> {
  const choices = projects.map((p) => ({
    name: `${p.name}  ${stripTrailingSlash(p.urls.primary)}`,
    value: p.name,
  }))
  return select('Select project:', choices, projects[0]!.name)
}

// Resolve project from identifier, prompting if ambiguous
export async function resolveProject(
  token: string,
  identifier: string,
  serverUrl?: string
): Promise<string> {
  // Search for projects with this name
  const { projects } = await listProjects(token, serverUrl)
  const matches = projects.filter((p) => p.name === identifier)

  if (matches.length === 0) {
    log.error(`Project "${identifier}" not found`)
    process.exit(1)
  }

  if (matches.length === 1) {
    return matches[0]!.name
  }

  // Multiple matches - prompt user to choose
  return promptProjectChoice(matches)
}

// Resolve project from argument or .scratch/project.toml
export async function resolveProjectOrConfig(
  token: string,
  identifier: string | undefined,
  serverUrl?: string
): Promise<string> {
  if (identifier) {
    return resolveProject(token, identifier, serverUrl)
  }

  const config = await loadProjectConfig('.')
  if (!config.name) {
    log.error('No project specified and no .scratch/project.toml found')
    log.error('Run this command from a project directory or specify a project name')
    process.exit(1)
  }

  return config.name
}

// Format date for display
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Format date with time for display (includes timezone)
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export async function listProjectsCommand(ctx: CloudContext): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await ctx.requireAuth()

  try {
    const { projects } = await listProjects(credentials.token, serverUrl)

    if (projects.length === 0) {
      log.info('No projects found.')
      log.info('Deploy your first project with `scratch publish`')
      return
    }

    log.info('')
    log.info('Your projects:')
    log.info('')

    for (const project of projects) {
      const version = project.live_version !== null ? `v${project.live_version}` : 'no deploy'
      log.info(`  ${project.name}  ${version}  ${stripTrailingSlash(project.urls.primary)}`)
    }

    log.info('')
    log.info(`${projects.length} project${projects.length === 1 ? '' : 's'}`)
  } catch (error) {
    if (error instanceof ApiError) {
      log.error(error.message)
      process.exit(1)
    }
    throw error
  }
}

export async function projectInfoCommand(ctx: CloudContext, identifier?: string): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await ctx.requireAuth()

  // Resolve project (handles ambiguity and config fallback)
  const projectName = await resolveProjectOrConfig(credentials.token, identifier, serverUrl)

  try {
    const { project } = await getProject(credentials.token, projectName, serverUrl)

    log.info('')
    log.info(`Project: ${project.name}`)
    log.info(`ID: ${project.id}`)
    log.info(`URLs:`)
    log.info(`  ${stripTrailingSlash(project.urls.primary)}`)
    log.info(`  ${stripTrailingSlash(project.urls.byId)}`)
    log.info(`Live Version: ${project.live_version !== null ? project.live_version : 'none'}`)
    log.info(`Total Deploys: ${project.deploy_count}`)
    log.info(`Created: ${formatDate(project.created_at)}`)
    if (project.last_deploy_at) {
      log.info(`Last Deploy: ${formatDate(project.last_deploy_at)}`)
    }
    log.info('')
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        log.error(`Project "${projectName}" not found`)
      } else {
        log.error(error.message)
      }
      process.exit(1)
    }
    throw error
  }
}

export interface ProjectDeleteOptions {
  force?: boolean
}

export async function projectDeleteCommand(ctx: CloudContext, identifier?: string, options: ProjectDeleteOptions = {}): Promise<void> {
  const serverUrl = await ctx.getServerUrl()
  const credentials = await ctx.requireAuth()

  // Resolve project (handles ambiguity and config fallback)
  const projectName = await resolveProjectOrConfig(credentials.token, identifier, serverUrl)

  // Verify project exists (resolveProject already checks this, but getProject gives us 404 handling)
  try {
    await getProject(credentials.token, projectName, serverUrl)
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        log.error(`Project "${projectName}" not found`)
      } else {
        log.error(error.message)
      }
      process.exit(1)
    }
    throw error
  }

  // Confirm deletion (unless --force)
  if (!options.force) {
    log.info('')
    log.info(`This will delete project "${projectName}" and all its deploys.`)
    log.info('This action cannot be undone.')
    log.info('')

    const answer = await prompt(`Type "${projectName}" to confirm: `)

    if (answer !== projectName) {
      log.error('Confirmation did not match. Deletion cancelled.')
      process.exit(1)
    }
  }

  try {
    await deleteProject(credentials.token, projectName, serverUrl)
    log.info(`Project "${projectName}" deleted`)
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        log.error(`Project "${projectName}" not found`)
      } else {
        log.error(error.message)
      }
      process.exit(1)
    }
    throw error
  }
}
