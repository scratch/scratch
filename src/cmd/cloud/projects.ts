import log from '../../logger'
import { requireAuth, loadProjectConfig } from '../../config'
import { listProjects, getProject, deleteProject, ApiError } from '../../cloud/api'
import { normalizeNamespace, formatNamespace } from './namespace'
import { prompt, select, stripTrailingSlash } from '../../util'

// Parse project identifier: "namespace/name" or just "name"
// Treats "_" and "global" as the global namespace (null)
export function parseProjectIdentifier(identifier: string): { name: string; namespace?: string | null } {
  const parts = identifier.split('/')
  if (parts.length === 2) {
    const [ns, name] = parts
    // normalizeNamespace converts "_" and "global" to null
    return { name, namespace: normalizeNamespace(ns) }
  }
  return { name: identifier }
}

// Prompt user to select from multiple projects
export async function promptProjectChoice(
  projects: { name: string; namespace: string | null }[]
): Promise<{ name: string; namespace: string | null }> {
  const choices = projects.map((p) => ({
    name: `${formatNamespace(p.namespace)}/${p.name}`,
    value: p,
  }))
  return select('Select project:', choices, projects[0])
}

// Resolve project from identifier, prompting if ambiguous
export async function resolveProject(
  token: string,
  identifier: string,
  optionNamespace?: string
): Promise<{ name: string; namespace: string | null }> {
  const parsed = parseProjectIdentifier(identifier)

  // If namespace specified via option, use that (normalize "_" and "global" to null)
  if (optionNamespace !== undefined) {
    return { name: parsed.name, namespace: normalizeNamespace(optionNamespace) }
  }

  // If namespace specified in identifier, use that
  if (parsed.namespace !== undefined) {
    return { name: parsed.name, namespace: parsed.namespace }
  }

  // Otherwise, search for projects with this name
  const { projects } = await listProjects(token)
  const matches = projects.filter((p) => p.name === parsed.name)

  if (matches.length === 0) {
    log.error(`Project "${parsed.name}" not found`)
    process.exit(1)
  }

  if (matches.length === 1) {
    return { name: matches[0].name, namespace: matches[0].namespace }
  }

  // Multiple matches - prompt user to choose
  return promptProjectChoice(matches)
}

// Resolve project from argument or .scratch/project.toml
export async function resolveProjectOrConfig(
  token: string,
  identifier: string | undefined,
  optionNamespace?: string
): Promise<{ name: string; namespace: string | null }> {
  if (identifier) {
    return resolveProject(token, identifier, optionNamespace)
  }

  const config = await loadProjectConfig('.')
  if (!config.name) {
    log.error('No project specified and no .scratch/project.toml found')
    log.error('Run this command from a project directory or specify a project name')
    process.exit(1)
  }

  return { name: config.name, namespace: config.namespace || null }
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

export async function listProjectsCommand(): Promise<void> {
  const credentials = await requireAuth()

  try {
    const { projects } = await listProjects(credentials.token)

    if (projects.length === 0) {
      log.info('No projects found.')
      log.info('Deploy your first project with `scratch cloud deploy`')
      return
    }

    log.info('')
    log.info('Your projects:')
    log.info('')

    for (const project of projects) {
      const ns = formatNamespace(project.namespace)
      const version = project.live_version !== null ? `v${project.live_version}` : 'no deploy'
      log.info(`  ${ns}/${project.name}  ${version}  ${stripTrailingSlash(project.url)}`)
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

export interface ProjectInfoOptions {
  namespace?: string
}

export async function projectInfoCommand(identifier?: string, options: ProjectInfoOptions = {}): Promise<void> {
  const credentials = await requireAuth()

  // Resolve project (handles namespace/name format, ambiguity, and config fallback)
  const resolved = await resolveProjectOrConfig(credentials.token, identifier, options.namespace)

  try {
    const { project } = await getProject(credentials.token, resolved.name, resolved.namespace)

    log.info('')
    log.info(`Project: ${project.name}`)
    log.info(`Namespace: ${formatNamespace(project.namespace)}`)
    log.info(`URL: ${stripTrailingSlash(project.url)}`)
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
        log.error(`Project "${formatNamespace(resolved.namespace)}/${resolved.name}" not found`)
      } else {
        log.error(error.message)
      }
      process.exit(1)
    }
    throw error
  }
}

export interface ProjectDeleteOptions {
  namespace?: string
}

export async function projectDeleteCommand(identifier?: string, options: ProjectDeleteOptions = {}): Promise<void> {
  const credentials = await requireAuth()

  // Resolve project (handles namespace/name format, ambiguity, and config fallback)
  const resolved = await resolveProjectOrConfig(credentials.token, identifier, options.namespace)
  const ns = formatNamespace(resolved.namespace)

  // Verify project exists (resolveProject already checks this, but getProject gives us 404 handling)
  try {
    await getProject(credentials.token, resolved.name, resolved.namespace)
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        log.error(`Project "${ns}/${resolved.name}" not found`)
      } else {
        log.error(error.message)
      }
      process.exit(1)
    }
    throw error
  }

  // Confirm deletion
  log.info('')
  log.info(`This will delete project "${ns}/${resolved.name}" and all its deploys.`)
  log.info('This action cannot be undone.')
  log.info('')

  const answer = await prompt(`Type "${resolved.name}" to confirm: `)

  if (answer !== resolved.name) {
    log.error('Confirmation did not match. Deletion cancelled.')
    process.exit(1)
  }

  try {
    await deleteProject(credentials.token, resolved.name, resolved.namespace)
    log.info('')
    log.info(`Project "${ns}/${resolved.name}" deleted`)
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        log.error(`Project "${ns}/${resolved.name}" not found`)
      } else {
        log.error(error.message)
      }
      process.exit(1)
    }
    throw error
  }
}
