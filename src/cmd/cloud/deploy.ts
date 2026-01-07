import log from '../../logger'
import { requireAuth } from '../../cloud/credentials'
import { deploy, ApiError } from '../../cloud/api'
import { getServerUrl } from '../../cloud/config'
import { buildCommand } from '../build'
import { BuildContext } from '../../build/context'
import { normalizeNamespace, formatNamespace, GLOBAL_NAMESPACE } from './namespace'
import { validateProjectName, getEmailDomain } from '../../shared/project'
import { formatBytes, prompt, select, openBrowser, stripTrailingSlash } from '../../util'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
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
export interface ProjectConfig {
  name?: string
  namespace?: string
  server_url?: string   // overrides global
  visibility?: string   // Group as string
}

// Load project config from .scratch/project.toml
export async function loadProjectConfig(projectPath: string): Promise<ProjectConfig> {
  const configPath = path.join(projectPath, '.scratch', 'project.toml')

  try {
    const content = await fs.readFile(configPath, 'utf-8')
    const parsed = parseToml(content) as { name?: string; namespace?: string; server_url?: string; visibility?: string }

    return {
      name: parsed.name,
      // Normalize namespace: "_", "global", "" all become 'global'
      namespace: parsed.namespace ? normalizeNamespace(parsed.namespace) : undefined,
      server_url: parsed.server_url,
      visibility: parsed.visibility,
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return {}
    }
    throw err
  }
}

// Escape string for TOML (handle quotes and backslashes)
function escapeTomlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// Save project config to .scratch/project.toml
export async function saveProjectConfig(projectPath: string, config: ProjectConfig): Promise<void> {
  const scratchDir = path.join(projectPath, '.scratch')
  const configPath = path.join(scratchDir, 'project.toml')

  // Ensure .scratch directory exists
  await fs.mkdir(scratchDir, { recursive: true })

  // Generate TOML content with comments
  const lines = [
    '# Scratch Cloud Project Configuration',
    '#',
    '# This file configures how your project deploys to Scratch Cloud.',
    '# Run `scratch cloud config` to update these settings interactively.',
    '',
  ]

  if (config.name) {
    lines.push('# Project name', `name = "${escapeTomlString(config.name)}"`, '')
  }

  if (config.namespace) {
    lines.push('# Namespace', `namespace = "${escapeTomlString(config.namespace)}"`, '')
  }

  if (config.server_url) {
    lines.push('# Server URL (overrides global default)', `server_url = "${escapeTomlString(config.server_url)}"`, '')
  }

  if (config.visibility) {
    lines.push('# Visibility', `visibility = "${escapeTomlString(config.visibility)}"`, '')
  }

  const content = lines.join('\n')
  await fs.writeFile(configPath, content, 'utf-8')
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
  dryRun?: boolean
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
  // Normalize namespace: "_", "global", "" from CLI become 'global'
  let namespace = options.namespace !== undefined ? normalizeNamespace(options.namespace) : (config.namespace || GLOBAL_NAMESPACE)

  // If no valid project name from options or config, run interactive setup
  if (!projectName || !validateProjectName(projectName).valid) {
    const result = await runInteractiveSetup(resolvedPath, credentials, config)
    projectName = result.name!  // runInteractiveSetup guarantees name is set
    namespace = result.namespace!  // runInteractiveSetup guarantees namespace is set
    config = result
  } else if (config.name) {
    // Show config being used
    log.info(`Using project configuration from ${configRelPath}`)
    log.info(`  name:      ${projectName}`)
    log.info(`  namespace: ${formatNamespace(namespace)}`)
    log.info('')
  }

  // Build base path: /{namespace}/{projectName} (use '_' in URL for global namespace)
  const urlNamespace = namespace === GLOBAL_NAMESPACE ? '_' : namespace
  const basePath = `/${urlNamespace}/${projectName}`

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
  log.info('Packaging for upload...')
  const { data: zipData, fileCount, totalBytes } = await createZip(distDir)
  const compressedBytes = zipData.byteLength
  log.info(`  ${fileCount} files, ${formatBytes(totalBytes)} -> ${formatBytes(compressedBytes)}`)

  // Dry run - show what would be deployed without uploading
  if (options.dryRun) {
    const serverUrl = config.server_url || await getServerUrl()
    const pagesUrl = getPagesUrl(serverUrl)
    const urlNamespace = namespace === GLOBAL_NAMESPACE ? '_' : namespace
    const deployUrl = `${pagesUrl}/${urlNamespace}/${projectName}`
    log.info('')
    log.info('Dry run complete. Would deploy to:')
    log.info(`  ${deployUrl}`)
    return
  }

  // Upload (with retry loop for name conflicts)
  while (true) {
    log.info('Uploading to server...')

    try {
      const result = await deploy(
        credentials.token,
        { name: projectName, namespace, visibility: config.visibility },
        zipData,
        config.server_url
      )

      log.info('')
      if (result.project.created) {
        log.info(`Created project "${projectName}"`)
      }
      log.info(`Deployed v${result.deploy.version} to ${stripTrailingSlash(result.url)}`)

      // Open the deployed page in browser
      await openBrowser(result.url)
      return
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 413) {
          log.error('Deploy too large. Reduce the size of your dist/ directory.')
          process.exit(1)
        } else if (error.status === 403) {
          // Project name conflict - prompt for new name
          log.info('')
          log.info(`Project "${projectName}" is owned by a different user.`)
          log.info('')

          while (true) {
            const newName = await prompt('Enter a different project name')

            if (!newName) {
              log.error('Project name is required')
              continue
            }

            const nameValidation = validateProjectName(newName)
            if (!nameValidation.valid) {
              log.error(nameValidation.error || 'Invalid project name')
              continue
            }

            projectName = newName
            break
          }

          // Save new config (preserve visibility and server_url from existing config)
          log.info('')
          log.info('Saving .scratch/project.toml...')
          await saveProjectConfig(resolvedPath, {
            name: projectName,
            namespace,
            visibility: config.visibility,
            server_url: config.server_url,
          })
          log.info('')
          log.info('Note: If your site has broken links, run `scratch cloud deploy` again to rebuild with the new name.')
          log.info('')

          // Retry with new name
          continue
        } else {
          const body = error.body as any
          log.error(`Deploy failed (${error.status})`)
          if (body?.error) {
            log.error(`  ${body.error}`)
          } else if (body?.message) {
            log.error(`  ${body.message}`)
          } else if (typeof body === 'string' && body) {
            // Show first line of text response (might be error page or stack trace)
            const firstLine = body.split('\n')[0].substring(0, 200)
            log.error(`  ${firstLine}`)
          }
          process.exit(1)
        }
      }
      throw error
    }
  }
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

    const nameValidation = validateProjectName(projectName)
    if (!nameValidation.valid) {
      log.error(nameValidation.error || 'Invalid project name')
      continue
    }

    break
  }

  // Prompt for namespace - simple choice between user's domain or global
  let namespace: string = GLOBAL_NAMESPACE

  if (userDomain) {
    const namespaceChoices = [
      { name: `${pagesUrl}/${userDomain}/${projectName}`, value: userDomain },
      { name: `${pagesUrl}/_/${projectName}`, value: GLOBAL_NAMESPACE },
    ]
    const defaultNs =
      existingConfig.namespace === GLOBAL_NAMESPACE && existingConfig.name ? GLOBAL_NAMESPACE : userDomain
    namespace = await select('Choose your project URL:', namespaceChoices, defaultNs)
  }

  // Save config
  log.info('')
  log.info('Saving .scratch/project.toml...')
  const newConfig: ProjectConfig = { name: projectName, namespace }
  await saveProjectConfig(resolvedPath, newConfig)
  log.info('')

  return newConfig
}
