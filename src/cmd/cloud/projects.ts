import log from '../../logger'
import { loadCredentials } from '../../cloud/credentials'
import { listProjects, getProject, deleteProject, ApiError } from '../../cloud/api'
import { normalizeNamespace } from './namespace'
import readline from 'readline'

// Parse project identifier: "namespace/name" or just "name"
// Treats "_" and "global" as the global namespace (null)
function parseProjectIdentifier(identifier: string): { name: string; namespace?: string | null } {
  const parts = identifier.split('/')
  if (parts.length === 2) {
    const [ns, name] = parts
    // normalizeNamespace converts "_" and "global" to null
    return { name, namespace: normalizeNamespace(ns) }
  }
  return { name: identifier }
}

// Prompt user to select from multiple projects
async function promptProjectChoice(
  projects: { name: string; namespace: string | null }[]
): Promise<{ name: string; namespace: string | null }> {
  console.log('')
  console.log('Multiple projects found with this name:')
  console.log('')

  projects.forEach((p, i) => {
    const ns = p.namespace || '_'
    console.log(`  ${i + 1}) ${ns}/${p.name}`)
  })

  console.log('')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question('Select project (number): ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })

  const choice = parseInt(answer, 10)
  if (isNaN(choice) || choice < 1 || choice > projects.length) {
    log.error('Invalid selection')
    process.exit(1)
  }

  return projects[choice - 1]
}

// Resolve project from identifier, prompting if ambiguous
async function resolveProject(
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

// Format bytes as human-readable string
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export async function listProjectsCommand(): Promise<void> {
  const credentials = await loadCredentials()
  if (!credentials) {
    log.error('Not logged in. Run `scratch cloud login` first.')
    process.exit(1)
  }

  try {
    const { projects } = await listProjects(credentials.token)

    if (projects.length === 0) {
      log.info('No projects found.')
      log.info('Deploy your first project with `scratch cloud deploy`')
      return
    }

    console.log('')
    console.log('Your projects:')
    console.log('')

    for (const project of projects) {
      const ns = project.namespace || '_'
      const version = project.live_version !== null ? `v${project.live_version}` : 'no deploy'
      console.log(`  ${ns}/${project.name}  ${version}  ${project.url}`)
    }

    console.log('')
    console.log(`${projects.length} project${projects.length === 1 ? '' : 's'}`)
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

export async function projectInfoCommand(identifier: string, options: ProjectInfoOptions = {}): Promise<void> {
  const credentials = await loadCredentials()
  if (!credentials) {
    log.error('Not logged in. Run `scratch cloud login` first.')
    process.exit(1)
  }

  // Resolve project (handles namespace/name format and ambiguity)
  const resolved = await resolveProject(credentials.token, identifier, options.namespace)

  try {
    const { project } = await getProject(credentials.token, resolved.name, resolved.namespace)

    console.log('')
    console.log(`Project: ${project.name}`)
    console.log(`Namespace: ${project.namespace || '_'} (${project.namespace ? 'custom' : 'global'})`)
    console.log(`URL: ${project.url}`)
    console.log(`Live Version: ${project.live_version !== null ? project.live_version : 'none'}`)
    console.log(`Total Deploys: ${project.deploy_count}`)
    console.log(`Created: ${formatDate(project.created_at)}`)
    if (project.last_deploy_at) {
      console.log(`Last Deploy: ${formatDate(project.last_deploy_at)}`)
    }
    console.log('')
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) {
        log.error(`Project "${resolved.namespace || '_'}/${resolved.name}" not found`)
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

export async function projectDeleteCommand(identifier: string, options: ProjectDeleteOptions = {}): Promise<void> {
  const credentials = await loadCredentials()
  if (!credentials) {
    log.error('Not logged in. Run `scratch cloud login` first.')
    process.exit(1)
  }

  // Resolve project (handles namespace/name format and ambiguity)
  const resolved = await resolveProject(credentials.token, identifier, options.namespace)
  const ns = resolved.namespace || '_'

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
  console.log('')
  console.log(`This will delete project "${ns}/${resolved.name}" and all its deploys.`)
  console.log('This action cannot be undone.')
  console.log('')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question(`Type "${resolved.name}" to confirm: `, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })

  if (answer !== resolved.name) {
    log.error('Confirmation did not match. Deletion cancelled.')
    process.exit(1)
  }

  try {
    await deleteProject(credentials.token, resolved.name, resolved.namespace)
    console.log('')
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
