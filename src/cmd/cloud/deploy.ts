import log from '../../logger'
import { requireAuth } from '../../cloud/credentials'
import { deploy, ApiError } from '../../cloud/api'
import { getServerUrl } from '../../cloud/config'
import { buildCommand } from '../build'
import { BuildContext } from '../../build/context'
import { normalizeNamespace } from './namespace'
import { formatBytes, prompt } from '../../util'
import fs from 'fs/promises'
import path from 'path'

// Derive pages URL from server URL
function getPagesUrl(serverUrl: string): string {
  try {
    const url = new URL(serverUrl)

    // Local dev: different ports (app=8788, pages=8787)
    if (url.hostname === 'localhost' && url.port === '8788') {
      url.port = '8787'
      return url.origin
    }

    // Production: different subdomains (app.* -> pages.*)
    if (url.hostname.startsWith('app.')) {
      url.hostname = url.hostname.replace('app.', 'pages.')
    } else {
      url.hostname = 'pages.' + url.hostname
    }
    return url.origin
  } catch {
    return serverUrl
  }
}

// Project config interface
interface ProjectConfig {
  name?: string
  namespace?: string | null
}

// Load project config from .scratch/project.toml
async function loadProjectConfig(projectPath: string): Promise<ProjectConfig> {
  const configPath = path.join(projectPath, '.scratch', 'project.toml')

  try {
    const content = await fs.readFile(configPath, 'utf-8')

    // Simple TOML parsing for name and namespace
    const config: ProjectConfig = {}

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed) continue

      const match = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/)
      if (match) {
        const [, key, value] = match
        if (key === 'name') config.name = value
        // Normalize namespace: "_" and "global" become null
        if (key === 'namespace') config.namespace = normalizeNamespace(value || null)
      }
    }

    return config
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {}
    }
    throw err
  }
}

// Save project config to .scratch/project.toml
async function saveProjectConfig(projectPath: string, config: ProjectConfig): Promise<void> {
  const scratchDir = path.join(projectPath, '.scratch')
  const configPath = path.join(scratchDir, 'project.toml')

  // Ensure .scratch directory exists
  await fs.mkdir(scratchDir, { recursive: true })

  // Generate TOML content
  let content = '# Scratch Cloud project configuration\n\n'

  if (config.name) {
    content += `name = "${config.name}"\n`
  }

  // Use "global" for global namespace (null), otherwise use the actual namespace
  const namespaceValue = config.namespace === null ? 'global' : config.namespace
  if (namespaceValue) {
    content += `namespace = "${namespaceValue}"\n`
  }

  await fs.writeFile(configPath, content, 'utf-8')
}

// Validate project name
function isValidProjectName(name: string): boolean {
  return /^[a-z][a-z0-9-]{2,62}$/.test(name)
}

// Validate namespace (must be domain-like or empty)
function isValidNamespace(ns: string): boolean {
  if (!ns) return true // Empty is valid (global namespace)
  return /^[a-z0-9][a-z0-9-]*\.[a-z0-9.-]+$/.test(ns)
}

// Create zip from directory
async function createZip(dirPath: string): Promise<{ data: ArrayBuffer; fileCount: number; totalBytes: number }> {
  const JSZipModule = await import('jszip')
  const JSZip = JSZipModule.default || JSZipModule
  const zip = new JSZip()

  let fileCount = 0
  let totalBytes = 0

  async function addDir(currentPath: string, zipPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        await addDir(fullPath, entryZipPath)
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath)
        zip.file(entryZipPath, content)
        fileCount++
        totalBytes += content.length
      }
      // Skip symlinks and other special files
    }
  }

  await addDir(dirPath, '')

  const data = await zip.generateAsync({ type: 'arraybuffer' })
  return { data, fileCount, totalBytes }
}

export interface DeployOptions {
  name?: string
  namespace?: string
  noBuild?: boolean
}

export async function deployCommand(projectPath: string = '.', options: DeployOptions = {}): Promise<void> {
  const resolvedPath = path.resolve(projectPath)

  // Check credentials (auto-login if not authenticated)
  const credentials = await requireAuth()

  // Load project config
  let config = await loadProjectConfig(resolvedPath)
  const configRelPath = '.scratch/project.toml'

  // Determine project name (CLI option > config > directory name)
  let projectName = options.name || config.name
  // Normalize namespace: "_" and "global" from CLI become null (global namespace)
  let namespace = options.namespace !== undefined ? normalizeNamespace(options.namespace) : config.namespace

  // If no valid project name from options or config, run interactive setup
  if (!projectName || !isValidProjectName(projectName)) {
    const result = await runInteractiveSetup(resolvedPath, credentials, config)
    projectName = result.name
    namespace = result.namespace
    config = result
  } else if (config.name) {
    // Show config being used
    log.info(`Using project configuration from ${configRelPath}`)
    log.info(`  name:      ${projectName}`)
    log.info(`  namespace: ${namespace || '_ (global)'}`)
    log.info('')
  }

  // Build base path: /{namespace}/{projectName}
  const basePath = `/${namespace || '_'}/${projectName}`

  // Build unless --no-build
  const distDir = path.join(resolvedPath, 'dist')

  if (!options.noBuild) {
    log.info('Building project...')
    const ctx = new BuildContext({ path: resolvedPath, base: basePath })
    await buildCommand(ctx, { ssg: true }, resolvedPath)
  }

  // Check dist/ exists
  try {
    const stat = await fs.stat(distDir)
    if (!stat.isDirectory()) {
      log.error('dist/ is not a directory')
      process.exit(1)
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      log.error('dist/ directory not found. Run `scratch build` first or remove --no-build')
      process.exit(1)
    }
    throw err
  }

  // Create zip
  log.info('Zipping dist/...')
  const { data: zipData, fileCount, totalBytes } = await createZip(distDir)
  log.info(`  ${fileCount} files, ${formatBytes(totalBytes)}`)

  // Upload
  log.info('Uploading to server...')

  try {
    const result = await deploy(credentials.token, projectName, zipData, namespace)

    log.info('')
    if (result.project.created) {
      log.info(`Created project "${projectName}"`)
    }
    log.info(`Deployed v${result.deploy.version} to ${result.url}`)
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 413) {
        log.error('Deploy too large. Reduce the size of your dist/ directory.')
      } else if (error.status === 403) {
        log.error(`Project "${projectName}" is owned by a different user.`)
      } else {
        const body = error.body as any
        log.error(body?.error || error.message)
      }
      process.exit(1)
    }
    throw error
  }
}

// Extract domain from email address
function getEmailDomain(email: string): string | null {
  const parts = email.split('@')
  if (parts.length !== 2) return null
  return parts[1].toLowerCase()
}

/**
 * Interactive setup - prompts user for project config, saves to .scratch/project.toml
 */
async function runInteractiveSetup(
  resolvedPath: string,
  credentials: { user: { email: string } },
  existingConfig: ProjectConfig
): Promise<ProjectConfig> {
  // Get user's email domain for namespace option
  const userDomain = getEmailDomain(credentials.user.email)
  const dirName = path.basename(resolvedPath)

  // Get pages URL for display
  const serverUrl = await getServerUrl()
  const pagesUrl = getPagesUrl(serverUrl)

  log.info('')
  log.info('Project Setup')
  log.info('=============')
  log.info('')

  // Prompt for project name
  const defaultName = existingConfig.name || dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
  let projectName: string

  while (true) {
    projectName = await prompt('Project name', defaultName)

    if (!projectName) {
      log.error('Project name is required')
      continue
    }

    if (!isValidProjectName(projectName)) {
      log.error('Invalid name. Must be 3-63 lowercase letters, numbers, and hyphens, starting with a letter.')
      continue
    }

    break
  }

  // Prompt for namespace - simple choice between user's domain or global
  let namespace: string | null = null

  if (userDomain) {
    log.info('')
    log.info('Choose your project URL:')
    log.info(`  1) ${pagesUrl}/${userDomain}/${projectName}/`)
    log.info(`  2) ${pagesUrl}/_/${projectName}/`)
    log.info('')

    // Default to user's domain, unless they previously chose global
    const defaultChoice = existingConfig.namespace === null && existingConfig.name ? '2' : '1'

    while (true) {
      const choice = await prompt('Choice', defaultChoice)

      if (choice === '1') {
        namespace = userDomain
        break
      } else if (choice === '2') {
        namespace = null
        break
      } else {
        log.error('Please enter 1 or 2')
      }
    }
  }

  // Save config
  log.info('')
  log.info('Saving .scratch/project.toml...')
  const newConfig: ProjectConfig = { name: projectName, namespace }
  await saveProjectConfig(resolvedPath, newConfig)
  log.info('')

  return newConfig
}
