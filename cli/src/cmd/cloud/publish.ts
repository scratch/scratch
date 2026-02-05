import log from '../../logger'
import { deploy, ApiError } from '../../cloud/api'
import { buildCommand } from '../build'
import { BuildContext } from '../../build/context'
import { validateProjectName } from '@scratch/shared/project'
import { formatBytes, openBrowser, stripTrailingSlash } from '../../util'
import {
  loadProjectConfig,
  saveProjectConfig,
  loadGlobalConfig,
  getLoggedInServers,
  // Prompts
  promptProjectName,
  promptVisibility,
  promptServerUrlSelection,
  type ProjectConfig,
} from '../../config'
import { CloudContext } from './context'
import { createZip } from './util'
import fs from 'fs/promises'
import path from 'path'

export interface PublishOptions {
  name?: string
  visibility?: string
  noBuild?: boolean
  noOpen?: boolean
  dryRun?: boolean
  www?: boolean
}

export async function publishCommand(ctx: CloudContext, projectPath: string = '.', options: PublishOptions = {}): Promise<void> {
  const resolvedPath = path.resolve(projectPath)

  // Load project config first to check for server_url override
  let config = await loadProjectConfig(resolvedPath)
  const configRelPath = '.scratch/project.toml'

  // Load global config for fallback defaults
  const globalConfig = await loadGlobalConfig()

  // Determine server URL priority:
  // 1. CLI option (--server flag)
  // 2. Project config
  // 3. If logged into multiple servers → prompt (with global default pre-selected)
  // 4. Global config or prompt
  let effectiveServerUrl: string
  let serverUrlWasPrompted = false
  const ctxServerUrl = ctx.getServerUrlIfExplicit()  // Returns URL only if explicitly set via --server

  if (ctxServerUrl) {
    // CLI option takes highest priority
    effectiveServerUrl = ctxServerUrl
  } else if (config.server_url) {
    // Project config is second priority
    effectiveServerUrl = config.server_url
  } else {
    // Check if logged into multiple servers - if so, always prompt
    const loggedInServers = await getLoggedInServers()
    if (loggedInServers.length >= 1) {
      // Multiple servers - prompt with global default pre-selected
      effectiveServerUrl = await promptServerUrlSelection()
      serverUrlWasPrompted = true
    } else if (globalConfig.server_url) {
      // Single or no servers logged in - use global config
      effectiveServerUrl = globalConfig.server_url
    } else {
      // No global config - prompt
      effectiveServerUrl = await promptServerUrlSelection()
      serverUrlWasPrompted = true
    }
  }

  // Now create context with resolved server URL
  const cloudCtx = new CloudContext({ serverUrl: effectiveServerUrl, projectPath: resolvedPath })

  // Check credentials (auto-login if not authenticated)
  const credentials = await cloudCtx.requireAuth()

  // Reload config in case it was updated during login/config
  config = await loadProjectConfig(resolvedPath)

  // Determine project name (CLI option > config > directory name)
  let projectName = options.name || config.name
  // Visibility: CLI option > project config > global config > interactive prompt
  let visibility = options.visibility || config.visibility || globalConfig.visibility

  // If no valid project name from options or config, run interactive setup
  if (!projectName || !validateProjectName(projectName).valid) {
    const result = await runInteractiveSetup(resolvedPath, credentials, config, effectiveServerUrl, globalConfig.visibility)
    projectName = result.name!  // runInteractiveSetup guarantees name is set
    config = result
    visibility = result.visibility  // Use visibility from interactive setup
  } else {
    // Valid name exists - save server_url to config if it was prompted
    if (serverUrlWasPrompted) {
      log.info('Saving server URL to .scratch/project.toml...')
      await saveProjectConfig(resolvedPath, {
        ...config,
        server_url: effectiveServerUrl,
      })
      log.info('')
    }

    if (config.name) {
      // Show config being used
      log.info(`Using project configuration from ${configRelPath}`)
      log.info(`  name: ${projectName}`)
      log.info('')
    }
  }

  // Build unless --no-build
  const distDir = path.join(resolvedPath, 'dist')

  if (!options.noBuild) {
    log.info('Building project...')
    // Base path: empty for www mode (served at root), otherwise /<user-id>/<project-name>/
    const basePath = options.www ? '' : `/${credentials.user.id}/${projectName}`
    const buildCtx = new BuildContext({ path: resolvedPath, base: basePath })
    await buildCommand(buildCtx, { ssg: true }, resolvedPath)
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
    log.info('')
    log.info('Dry run complete. Would deploy project:')
    log.info(`  ${projectName}`)
    log.info('')
    log.info('(Actual URLs will be shown after deploy based on your account)')
    return
  }

  // Upload (with retry loop for name conflicts)
  while (true) {
    log.info(`Uploading to ${effectiveServerUrl}...`)

    try {
      const result = await deploy(
        credentials.token,
        { name: projectName, visibility, project_id: config.id, www: options.www },
        zipData,
        effectiveServerUrl
      )

      log.info('')
      if (result.project.created) {
        log.info(`Created project "${projectName}"`)
      }
      log.info(`Deployed v${result.deploy.version}`)
      log.info('')

      // Display URLs based on www mode
      if (options.www) {
        if (result.www?.configured && result.urls.www) {
          // WWW_PROJECT_ID is configured for this project - show www URL
          log.info('URL:')
          log.info(`  ${stripTrailingSlash(result.urls.www)}`)
        } else {
          // WWW_PROJECT_ID not configured - show warning and fallback URLs
          log.info('URLs:')
          log.info(`  ${stripTrailingSlash(result.urls.primary)}`)
          log.info(`  ${stripTrailingSlash(result.urls.byId)}`)
          log.info('')
          log.info('Note: To serve this project at the naked domain, configure your server with:')
          log.info(`  WWW_PROJECT_ID=${result.www?.project_id || result.project.id}`)
        }
      } else {
        log.info('URLs:')
        log.info(`  ${stripTrailingSlash(result.urls.primary)}`)
        log.info(`  ${stripTrailingSlash(result.urls.byId)}`)
      }

      // Save project ID if it changed (new project or wasn't saved before)
      if (result.project.id !== config.id) {
        await saveProjectConfig(resolvedPath, {
          ...config,
          id: result.project.id,
          name: projectName,
        })
      }

      // Open the deployed page in browser unless --no-open
      // Use www URL if in www mode and configured, otherwise use primary URL
      if (!options.noOpen) {
        const urlToOpen = (options.www && result.www?.configured && result.urls.www)
          ? result.urls.www
          : result.urls.primary
        await openBrowser(urlToOpen)
      }
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

          projectName = await promptProjectName(undefined, undefined)

          // Save new config (preserve visibility and server_url from existing config, clear id for new project)
          log.info('')
          log.info('Saving .scratch/project.toml...')
          await saveProjectConfig(resolvedPath, {
            name: projectName,
            visibility: config.visibility,
            server_url: config.server_url,
            // Don't preserve id - this will be a new project
          })
          config = { ...config, id: undefined, name: projectName }
          log.info('')
          log.info('Note: If your site has broken links, run `scratch publish` again to rebuild with the new name.')
          log.info('')

          // Retry with new name
          continue
        } else if (error.status === 400) {
          const body = error.body as any
          const code = body?.code

          if (code === 'PROJECT_NOT_FOUND') {
            log.error('')
            log.error('Project not found on server.')
            log.error('')
            log.error('This can happen if:')
            log.error(`  - The project was deleted from the server`)
            log.error(`  - You're logged in as a different user (currently logged in as ${credentials.user.email})`)
            log.error(`  - The .scratch/project.toml contains an ID from a different server`)
            log.error('')
            log.error('To fix, remove the "id" line from .scratch/project.toml and publish again.')
            process.exit(1)
          } else if (code === 'WWW_PROJECT_MISMATCH') {
            log.error('')
            log.error('Cannot publish with --www flag.')
            log.error('')
            log.error('The server\'s WWW_PROJECT_ID is already configured for a different project.')
            log.error('Update the server configuration if you want to change which project is served at the root domain.')
            process.exit(1)
          } else if (code === 'PROJECT_NAME_TAKEN') {
            log.error('')
            log.error(`You already have a project named "${projectName}".`)
            log.error('')
            log.error(`Run \`scratch projects info ${projectName}\` to see details.`)
            process.exit(1)
          } else {
            log.error(`Deploy failed (${error.status})`)
            if (body?.error) {
              log.error(`  ${body.error}`)
            }
            process.exit(1)
          }
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
 * Interactive setup - prompts user for project name and visibility only
 * Called when config exists but name is invalid
 */
async function runInteractiveSetup(
  resolvedPath: string,
  credentials: { user: { email: string } },
  existingConfig: ProjectConfig,
  serverUrl: string,
  globalVisibility?: string
): Promise<ProjectConfig> {
  const dirName = path.basename(resolvedPath)

  log.info('')
  log.info('Project Setup')
  log.info('=============')
  log.info('')

  // 1. Prompt for project name
  const projectName = await promptProjectName(existingConfig.name, dirName)

  // 2. Prompt for visibility (project config > global config > prompt default)
  const visibility = await promptVisibility(credentials.user.email, existingConfig.visibility || globalVisibility)

  // Save config
  log.info('')
  log.info('Saving .scratch/project.toml...')
  const newConfig: ProjectConfig = {
    name: projectName,
    visibility,
    server_url: serverUrl,
  }
  await saveProjectConfig(resolvedPath, newConfig)
  log.info('')

  return newConfig
}
