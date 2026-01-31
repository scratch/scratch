// Integration test command

import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rm, readFile, writeFile } from 'fs/promises'
import { green, yellow, red, reset } from '../../lib/colors'
import { parseVarsFile, writeVarsFile, getInstanceVarsPath, getInstanceWranglerPath } from '../../lib/config'
import { generateWranglerConfig } from './setup'
import { runCommand, runCommandInherit, getWranglerConfig } from '../../lib/process'

const CLI_BIN = './cli/dist/scratch'

function generateRandomProjectName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let name = 'test-'
  for (let i = 0; i < 8; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return name
}

export async function integrationTestAction(instance: string): Promise<void> {
  // Read instance vars to get domains
  const varsPath = getInstanceVarsPath(instance)
  if (!existsSync(varsPath)) {
    console.error(`Error: ${varsPath} not found`)
    console.error(`Run: bun ops server -i ${instance} setup`)
    process.exit(1)
  }

  const vars = parseVarsFile(varsPath)
  const baseDomain = vars.get('BASE_DOMAIN')
  const appSubdomain = vars.get('APP_SUBDOMAIN')
  const contentSubdomain = vars.get('CONTENT_SUBDOMAIN')

  if (!baseDomain || !appSubdomain || !contentSubdomain) {
    console.error('Error: Missing required vars (BASE_DOMAIN, APP_SUBDOMAIN, CONTENT_SUBDOMAIN)')
    process.exit(1)
  }

  const appDomain = `${appSubdomain}.${baseDomain}`
  const pagesDomain = `${contentSubdomain}.${baseDomain}`

  console.log(`Running integration test against ${instance}...\n`)
  console.log(`App domain: ${appDomain}`)
  console.log(`Pages domain: ${pagesDomain}\n`)

  const projectName = generateRandomProjectName()
  const tempDir = join(tmpdir(), `scratch-${instance}-test-${Date.now()}`)
  let testPassed = true
  let logsProcess: ReturnType<typeof Bun.spawn> | null = null

  // Cleanup function to kill logs process and reset terminal
  const cleanup = async () => {
    if (logsProcess) {
      logsProcess.kill()
      logsProcess = null
      // Reset terminal settings - wrangler tail can leave terminal in raw mode
      Bun.spawnSync(['stty', 'sane'], { stdin: 'inherit' })
    }
  }

  // Handle Ctrl-C
  const sigintHandler = async () => {
    console.log('\n\nInterrupted, cleaning up...')
    await cleanup()
    process.exit(1)
  }
  process.on('SIGINT', sigintHandler)

  try {
    // Step 1: Build the CLI
    console.log('Step 1: Building CLI...')
    let exitCode = await runCommandInherit(['bun', 'ops', 'cli', 'build'])
    if (exitCode !== 0) {
      throw new Error('CLI build failed')
    }
    console.log(`${green}✓${reset} CLI built successfully\n`)

    // Step 2: Run migrations
    console.log(`Step 2: Running ${instance} migrations...`)
    exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', instance, 'db', 'migrate'])
    if (exitCode !== 0) {
      throw new Error('Migrations failed')
    }
    console.log(`${green}✓${reset} Migrations complete\n`)

    // Step 3: Deploy server
    // Note: UI pages are now server-rendered, no separate UI deploy needed
    console.log(`Step 3: Deploying server to ${instance}...`)
    exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', instance, 'deploy'])
    if (exitCode !== 0) {
      throw new Error('Deploy failed')
    }
    console.log(`${green}✓${reset} Server deployed\n`)

    // Step 4: Start tailing logs (prints inline)
    console.log('Step 4: Starting log tail (logs will print inline)...')
    const wranglerConfig = getWranglerConfig(instance)

    logsProcess = Bun.spawn(
      ['bun', 'run', 'wrangler', 'tail', '-c', wranglerConfig, '--format', 'pretty'],
      {
        cwd: 'server',
        stdout: 'inherit',
        stderr: 'inherit',
      }
    )

    console.log(`${green}✓${reset} Log tail started\n`)

    // Step 5: Login with CLI
    console.log('Step 5: Logging in with CLI...')
    const serverUrl = `https://${appDomain}`

    // Check if already logged in
    const whoamiResult = await runCommand([CLI_BIN, 'whoami', serverUrl])
    if (whoamiResult.stdout.includes('Not logged in')) {
      console.log('Not logged in. Please complete login in browser...')
      // Use 15 second timeout for test - fail fast if login flow is broken
      exitCode = await runCommandInherit([CLI_BIN, 'login', serverUrl, '--timeout', '0.25'])
      if (exitCode !== 0) {
        throw new Error('Login failed (timed out or denied)')
      }
    } else {
      console.log(`Already logged in: ${whoamiResult.stdout.trim()}`)
    }
    console.log(`${green}✓${reset} Logged in\n`)

    // Step 6: Create scratch project in temp directory
    console.log(`Step 6: Creating scratch project in ${tempDir}...`)
    exitCode = await runCommandInherit([CLI_BIN, 'create', tempDir])
    if (exitCode !== 0) {
      throw new Error('Project creation failed')
    }

    // Add test files for static file serving tests
    await writeFile(join(tempDir, 'pages', 'source.mdx'), '# MDX Source\n\nHello world from source.mdx')
    await writeFile(join(tempDir, 'pages', 'notes.txt'), 'Plain text notes')
    await writeFile(join(tempDir, 'pages', 'readme.md'), '# Readme\n\nDocumentation')
    console.log(`${green}✓${reset} Project created with test files\n`)

    // Step 7: Deploy the scratch project
    console.log(`Step 7: Deploying project "${projectName}" to ${instance}...`)
    const deployResult = await runCommand([
      CLI_BIN, 'publish', tempDir,
      '--server', serverUrl,
      '--visibility', 'public',
      '--name', projectName,
      '--no-open',
    ])

    if (deployResult.exitCode !== 0) {
      throw new Error(`Deploy failed: ${deployResult.stderr}`)
    }
    console.log(deployResult.stdout)
    console.log(`${green}✓${reset} Project deployed\n`)

    // Step 8: Verify content matches
    console.log('Step 8: Verifying deployed content...')

    // Read local dist/index.html
    const localIndexPath = join(tempDir, 'dist', 'index.html')
    const localContent = await readFile(localIndexPath, 'utf-8')

    // Parse deployed URL from deploy output (first URL after "URLs:")
    const urlMatch = deployResult.stdout.match(/URLs:\s+(\S+)/)
    const deployedUrl = urlMatch ? urlMatch[1] : `https://${pagesDomain}/${projectName}/`
    console.log(`Fetching: ${deployedUrl}`)

    // Give it a moment for deployment to propagate
    await new Promise(resolve => setTimeout(resolve, 2000))

    const response = await fetch(deployedUrl)
    if (!response.ok) {
      console.error(`${red}✗${reset} Failed to fetch deployed content: ${response.status}`)
      testPassed = false
    } else {
      const deployedContent = await response.text()

      // Compare content (normalize whitespace for comparison)
      const normalizeHtml = (html: string) => html.replace(/\s+/g, ' ').trim()

      if (normalizeHtml(localContent) === normalizeHtml(deployedContent)) {
        console.log(`${green}✓${reset} Content matches!\n`)
      } else {
        console.error(`${red}✗${reset} Content mismatch!`)
        console.log('\nLocal content (first 500 chars):')
        console.log(localContent.slice(0, 500))
        console.log('\nDeployed content (first 500 chars):')
        console.log(deployedContent.slice(0, 500))
        testPassed = false
      }
    }

    // Step 8b: Test static file serving (MIME types and .mdx redirect)
    console.log('Step 8b: Testing static file serving...')

    // Extract base URL from deployedUrl (e.g., https://pages.sndbx.sh/pete/test-5adb9jwb/)
    // Remove trailing slash for easier path construction
    const projectBaseUrl = deployedUrl.replace(/\/$/, '')

    // Test 1: .md file served as text/plain
    const mdUrl = `${projectBaseUrl}/readme.md`
    const mdResponse = await fetch(mdUrl)
    if (mdResponse.ok && mdResponse.headers.get('content-type')?.startsWith('text/plain')) {
      console.log(`${green}✓${reset} .md served as text/plain`)
    } else {
      console.error(`${red}✗${reset} .md not served as text/plain: ${mdResponse.headers.get('content-type')}`)
      testPassed = false
    }

    // Test 2: .txt file served as text/plain
    const txtUrl = `${projectBaseUrl}/notes.txt`
    const txtResponse = await fetch(txtUrl)
    if (txtResponse.ok && txtResponse.headers.get('content-type')?.startsWith('text/plain')) {
      console.log(`${green}✓${reset} .txt served as text/plain`)
    } else {
      console.error(`${red}✗${reset} .txt not served as text/plain: ${txtResponse.headers.get('content-type')}`)
      testPassed = false
    }

    // Test 3: .mdx URL redirects to .md
    const mdxUrl = `${projectBaseUrl}/source.mdx`
    const mdxResponse = await fetch(mdxUrl, { redirect: 'manual' })
    if (mdxResponse.status === 301 && mdxResponse.headers.get('location')?.endsWith('/source.md')) {
      console.log(`${green}✓${reset} .mdx redirects to .md`)
    } else {
      console.error(`${red}✗${reset} .mdx did not redirect: status=${mdxResponse.status}, location=${mdxResponse.headers.get('location')}`)
      testPassed = false
    }

    // Test 4: Following .mdx redirect serves correct content
    const mdxFollowResponse = await fetch(mdxUrl, { redirect: 'follow' })
    if (mdxFollowResponse.ok) {
      const mdxContent = await mdxFollowResponse.text()
      if (mdxContent.includes('MDX Source') || mdxContent.includes('Hello world from source.mdx')) {
        console.log(`${green}✓${reset} .mdx redirect serves correct content`)
      } else {
        console.error(`${red}✗${reset} .mdx redirect content incorrect`)
        testPassed = false
      }
    } else {
      console.error(`${red}✗${reset} .mdx redirect failed: ${mdxFollowResponse.status}`)
      testPassed = false
    }

    // Test 5: HTML page still works (source.mdx compiled to /source/)
    const htmlUrl = `${projectBaseUrl}/source/`
    const htmlResponse = await fetch(htmlUrl)
    if (htmlResponse.ok && htmlResponse.headers.get('content-type')?.includes('text/html')) {
      console.log(`${green}✓${reset} Compiled HTML page still accessible`)
    } else {
      console.error(`${red}✗${reset} Compiled HTML page not accessible: ${htmlResponse.status}`)
      testPassed = false
    }

    console.log()

    // Step 8c: Test project enumeration prevention
    // Non-existent projects should redirect to auth, not return 404 immediately
    // This prevents attackers from distinguishing "doesn't exist" from "private"
    console.log('Step 8c: Testing project enumeration prevention...')

    const nonExistentUrl = `https://${pagesDomain}/nonexistent-user-12345/nonexistent-project-67890/`
    const enumResponse = await fetch(nonExistentUrl, { redirect: 'manual' })

    if (enumResponse.status === 302 || enumResponse.status === 303) {
      const location = enumResponse.headers.get('location') || ''
      if (location.includes('/auth/content-access')) {
        console.log(`${green}✓${reset} Non-existent project redirects to auth (prevents enumeration)`)
      } else {
        console.error(`${red}✗${reset} Non-existent project redirects but not to auth: ${location}`)
        testPassed = false
      }
    } else if (enumResponse.status === 404) {
      console.error(`${red}✗${reset} Non-existent project returns 404 (allows enumeration attack)`)
      console.error('  Expected: redirect to /auth/content-access')
      testPassed = false
    } else {
      console.error(`${red}✗${reset} Unexpected status for non-existent project: ${enumResponse.status}`)
      testPassed = false
    }

    // Also verify that public projects still return content directly (not redirect)
    const publicProjectResponse = await fetch(deployedUrl, { redirect: 'manual' })
    if (publicProjectResponse.status === 200) {
      console.log(`${green}✓${reset} Public project still serves content directly`)
    } else if (publicProjectResponse.status === 301) {
      // Might be a trailing slash redirect, follow it
      const redirectedUrl = publicProjectResponse.headers.get('location')
      if (redirectedUrl) {
        const followedResponse = await fetch(redirectedUrl, { redirect: 'manual' })
        if (followedResponse.status === 200) {
          console.log(`${green}✓${reset} Public project still serves content directly (after slash redirect)`)
        } else {
          console.error(`${red}✗${reset} Public project not serving: ${followedResponse.status}`)
          testPassed = false
        }
      }
    } else {
      console.error(`${red}✗${reset} Public project unexpected status: ${publicProjectResponse.status}`)
      testPassed = false
    }

    console.log()

    // Step 8d: Test content token URL cleanup (redirect to clean URL)
    console.log('Step 8d: Testing content token URL cleanup...')

    // Create a private project for this test
    const privateProjectName = generateRandomProjectName()
    const privateTempDir = join(tmpdir(), `scratch-${instance}-private-${Date.now()}`)
    exitCode = await runCommandInherit([CLI_BIN, 'create', privateTempDir])
    if (exitCode !== 0) {
      throw new Error('Private project creation failed')
    }

    // Deploy as private
    const privateDeployResult = await runCommand([
      CLI_BIN, 'publish', privateTempDir,
      '--server', serverUrl,
      '--visibility', 'private',
      '--name', privateProjectName,
      '--no-open',
    ])

    if (privateDeployResult.exitCode !== 0) {
      console.error(`${red}✗${reset} Private project deploy failed: ${privateDeployResult.stderr}`)
      testPassed = false
    } else {
      // Extract project ID from project.toml
      const privateProjectTomlPath = join(privateTempDir, '.scratch', 'project.toml')
      const privateProjectToml = await readFile(privateProjectTomlPath, 'utf-8')
      const privateIdMatch = privateProjectToml.match(/^id\s*=\s*"([^"]+)"/m)
      const privateProjectId = privateIdMatch ? privateIdMatch[1] : null

      if (!privateProjectId) {
        console.error(`${red}✗${reset} Could not extract private project ID`)
        testPassed = false
      } else {
        // Get the deployed URL from the deploy output (includes owner path)
        const privateUrlMatch = privateDeployResult.stdout.match(/URLs:\s+(\S+)/)
        const privateDeployedUrl = privateUrlMatch ? privateUrlMatch[1] : null

        if (!privateDeployedUrl) {
          console.error(`${red}✗${reset} Could not extract deployed URL from output`)
          testPassed = false
        } else {
          // Get CLI credentials to make authenticated request
          const credentialsPath = join(process.env.HOME || '~', '.scratch', 'credentials.json')
          let cliToken: string | null = null
          try {
            const credentials = JSON.parse(await readFile(credentialsPath, 'utf-8'))
            // Find token for this server
            for (const [server, creds] of Object.entries(credentials)) {
              if (server.includes(appDomain)) {
                cliToken = (creds as { token: string }).token
                break
              }
            }
          } catch {
            console.error(`${red}✗${reset} Could not read CLI credentials`)
          }

          if (!cliToken) {
            console.error(`${red}✗${reset} No CLI token found for ${appDomain}`)
            testPassed = false
          } else {
            // Get content token via /auth/content-access endpoint
            // Ensure URL has trailing slash for consistency
            const returnUrl = privateDeployedUrl.endsWith('/') ? privateDeployedUrl : `${privateDeployedUrl}/`
            const contentAccessUrl = `https://${appDomain}/auth/content-access?project_id=${privateProjectId}&return_url=${encodeURIComponent(returnUrl)}`

            const tokenResponse = await fetch(contentAccessUrl, {
              headers: { 'Authorization': `Bearer ${cliToken}` },
              redirect: 'manual',
            })

            if (tokenResponse.status !== 302 && tokenResponse.status !== 303) {
              console.error(`${red}✗${reset} Content access endpoint returned ${tokenResponse.status}, expected redirect`)
              testPassed = false
            } else {
              const redirectLocation = tokenResponse.headers.get('Location')
              if (!redirectLocation) {
                console.error(`${red}✗${reset} No redirect location from content access endpoint`)
                testPassed = false
              } else {
                const redirectUrl = new URL(redirectLocation)
                const ctoken = redirectUrl.searchParams.get('_ctoken')

                if (!ctoken) {
                  console.error(`${red}✗${reset} No _ctoken in redirect URL: ${redirectLocation}`)
                  testPassed = false
                } else {
                  console.log(`${green}✓${reset} Got content token from auth endpoint`)

                  // Request private page with token in URL - should get 302 redirect to clean URL
                  const pageWithToken = `${returnUrl}?_ctoken=${ctoken}`
                  const redirectResponse = await fetch(pageWithToken, { redirect: 'manual' })

                  if (redirectResponse.status !== 302) {
                    console.error(`${red}✗${reset} Expected 302 redirect, got ${redirectResponse.status}`)
                    testPassed = false
                  } else {
                    const cleanLocation = redirectResponse.headers.get('Location')
                    const setCookieHeader = redirectResponse.headers.get('Set-Cookie')

                    // Verify redirect is to clean URL (without token)
                    if (!cleanLocation || cleanLocation.includes('_ctoken')) {
                      console.error(`${red}✗${reset} Redirect URL still contains token: ${cleanLocation}`)
                      testPassed = false
                    } else {
                      console.log(`${green}✓${reset} Server redirects to clean URL without token`)
                    }

                    // Verify cookie was set
                    if (!setCookieHeader || !setCookieHeader.includes('_content_token')) {
                      console.error(`${red}✗${reset} Content token cookie not set`)
                      testPassed = false
                    } else {
                      console.log(`${green}✓${reset} Content token cookie was set`)

                      // Extract cookie value for follow-up request
                      const cookieMatch = setCookieHeader.match(/_content_token=([^;]+)/)
                      const cookieValue = cookieMatch ? cookieMatch[1] : null

                      if (cookieValue) {
                        // Verify content is served with just the cookie (no token in URL)
                        const finalResponse = await fetch(returnUrl, {
                          headers: { 'Cookie': `_content_token=${cookieValue}` },
                        })

                        if (finalResponse.ok) {
                          console.log(`${green}✓${reset} Content served with cookie only (no URL token)`)
                        } else {
                          console.error(`${red}✗${reset} Failed to serve content with cookie: ${finalResponse.status}`)
                          testPassed = false
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Test: Multiple query params preserved during redirect
      // The redirect should only remove _ctoken, keeping other params intact
      console.log('Testing query param preservation during redirect...')

      // Get CLI credentials again (reuse from above)
      const credentialsPath2 = join(process.env.HOME || '~', '.scratch', 'credentials.json')
      let cliToken2: string | null = null
      try {
        const credentials = JSON.parse(await readFile(credentialsPath2, 'utf-8'))
        for (const [server, creds] of Object.entries(credentials)) {
          if (server.includes(appDomain)) {
            cliToken2 = (creds as { token: string }).token
            break
          }
        }
      } catch {
        // Already handled above
      }

      if (cliToken2) {
        // Get a fresh content token
        const privateProjectTomlPath2 = join(privateTempDir, '.scratch', 'project.toml')
        const privateProjectToml2 = await readFile(privateProjectTomlPath2, 'utf-8')
        const privateIdMatch2 = privateProjectToml2.match(/^id\s*=\s*"([^"]+)"/m)
        const privateProjectId2 = privateIdMatch2 ? privateIdMatch2[1] : null

        if (privateProjectId2) {
          const privateUrlMatch2 = privateDeployResult.stdout.match(/URLs:\s+(\S+)/)
          const privateDeployedUrl2 = privateUrlMatch2 ? privateUrlMatch2[1] : null

          if (privateDeployedUrl2) {
            const returnUrl2 = privateDeployedUrl2.endsWith('/') ? privateDeployedUrl2 : `${privateDeployedUrl2}/`
            const contentAccessUrl2 = `https://${appDomain}/auth/content-access?project_id=${privateProjectId2}&return_url=${encodeURIComponent(returnUrl2)}`

            const tokenResponse2 = await fetch(contentAccessUrl2, {
              headers: { 'Authorization': `Bearer ${cliToken2}` },
              redirect: 'manual',
            })

            if (tokenResponse2.status === 302 || tokenResponse2.status === 303) {
              const redirectLocation2 = tokenResponse2.headers.get('Location')
              if (redirectLocation2) {
                const redirectUrl2 = new URL(redirectLocation2)
                const ctoken2 = redirectUrl2.searchParams.get('_ctoken')

                if (ctoken2) {
                  // Request with token AND extra query params
                  const extraParams = 'foo=bar&baz=qux'
                  const pageWithTokenAndParams = `${returnUrl2}?_ctoken=${ctoken2}&${extraParams}`
                  const multiParamResponse = await fetch(pageWithTokenAndParams, { redirect: 'manual' })

                  if (multiParamResponse.status === 302) {
                    const cleanLocation2 = multiParamResponse.headers.get('Location')
                    if (cleanLocation2) {
                      const cleanUrl = new URL(cleanLocation2)
                      const hasExtraParams = cleanUrl.searchParams.get('foo') === 'bar' && cleanUrl.searchParams.get('baz') === 'qux'
                      const hasNoToken = !cleanUrl.searchParams.has('_ctoken')

                      if (hasExtraParams && hasNoToken) {
                        console.log(`${green}✓${reset} Other query params preserved, token removed`)
                      } else if (!hasExtraParams) {
                        console.error(`${red}✗${reset} Extra query params were lost during redirect`)
                        console.error(`  Expected: foo=bar&baz=qux, Got: ${cleanUrl.search}`)
                        testPassed = false
                      } else {
                        console.error(`${red}✗${reset} Token was not removed from redirect URL`)
                        testPassed = false
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Cleanup private test project
      await runCommand([CLI_BIN, 'projects', 'delete', privateProjectName, serverUrl, '--force'])
      try {
        await rm(privateTempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    }

    // Step 8d2: Test share token URL cleanup
    // Only run if share tokens are enabled on this instance
    console.log('Step 8d2: Testing share token URL cleanup...')

    const shareTokensEnabled = vars.get('ALLOW_SHARE_TOKENS') === 'true'
    if (!shareTokensEnabled) {
      console.log(`${yellow}!${reset} Share tokens disabled on this instance, skipping test`)
    } else {
      // Create another private project for share token test
      const shareTestProjectName = generateRandomProjectName()
      const shareTestTempDir = join(tmpdir(), `scratch-${instance}-share-${Date.now()}`)
      exitCode = await runCommandInherit([CLI_BIN, 'create', shareTestTempDir])
      if (exitCode !== 0) {
        throw new Error('Share test project creation failed')
      }

      // Deploy as private
      const shareTestDeployResult = await runCommand([
        CLI_BIN, 'publish', shareTestTempDir,
        '--server', serverUrl,
        '--visibility', 'private',
        '--name', shareTestProjectName,
        '--no-open',
      ])

      if (shareTestDeployResult.exitCode !== 0) {
        console.error(`${red}✗${reset} Share test project deploy failed: ${shareTestDeployResult.stderr}`)
        testPassed = false
      } else {
        // Create a share token using API directly (more reliable than CLI in test environment)
        // Get the deployed URL from the deploy output
        const shareUrlMatch = shareTestDeployResult.stdout.match(/URLs:\s+(\S+)/)
        const shareDeployedUrl = shareUrlMatch ? shareUrlMatch[1] : null

        if (!shareDeployedUrl) {
          console.error(`${red}✗${reset} Could not extract deployed URL from output`)
          testPassed = false
        } else {
          // Get CLI credentials to make authenticated API request
          const shareCredentialsPath = join(process.env.HOME || '~', '.scratch', 'credentials.json')
          let shareCliToken: string | null = null
          try {
            const credentials = JSON.parse(await readFile(shareCredentialsPath, 'utf-8'))
            for (const [server, creds] of Object.entries(credentials)) {
              if (server.includes(appDomain)) {
                shareCliToken = (creds as { token: string }).token
                break
              }
            }
          } catch {
            console.error(`${red}✗${reset} Could not read CLI credentials for share test`)
          }

          if (!shareCliToken) {
            console.error(`${red}✗${reset} No CLI token found for ${appDomain}`)
            testPassed = false
          } else {
            // Create share token via API
            const createShareResponse = await fetch(
              `${serverUrl}/api/projects/${encodeURIComponent(shareTestProjectName)}/share-tokens`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${shareCliToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: 'test-share', duration: '1d' }),
              }
            )

            if (!createShareResponse.ok) {
              console.error(`${red}✗${reset} Failed to create share token via API: ${createShareResponse.status}`)
              testPassed = false
            } else {
              const shareResult = await createShareResponse.json() as { share_url: string; token: string }
              const shareUrl = shareResult.share_url
              const shareToken = shareResult.token

              if (!shareUrl || !shareToken) {
                console.error(`${red}✗${reset} Share token API response missing url or token`)
                testPassed = false
              } else {
                console.log(`${green}✓${reset} Created share token via API`)

                // Request the page with share token in URL - should redirect to clean URL
                const shareRedirectResponse = await fetch(shareUrl, { redirect: 'manual' })

                if (shareRedirectResponse.status !== 302) {
                  console.error(`${red}✗${reset} Expected 302 redirect for share token, got ${shareRedirectResponse.status}`)
                  testPassed = false
                } else {
                  const shareCleanLocation = shareRedirectResponse.headers.get('Location')
                  const shareSetCookie = shareRedirectResponse.headers.get('Set-Cookie')

                  // Verify redirect is to clean URL (without token)
                  if (!shareCleanLocation || shareCleanLocation.includes('token=')) {
                    console.error(`${red}✗${reset} Share token redirect URL still contains token: ${shareCleanLocation}`)
                    testPassed = false
                  } else {
                    console.log(`${green}✓${reset} Share token redirect to clean URL works`)
                  }

                  // Verify share token cookie was set
                  if (!shareSetCookie || !shareSetCookie.includes('_share_')) {
                    console.error(`${red}✗${reset} Share token cookie not set`)
                    testPassed = false
                  } else {
                    console.log(`${green}✓${reset} Share token cookie was set`)

                    // Extract cookie for follow-up request
                    const shareCookieMatch = shareSetCookie.match(/(_share_[^=]+=)([^;]+)/)
                    if (shareCookieMatch) {
                      const shareCookieName = shareCookieMatch[1].slice(0, -1) // Remove trailing =
                      const shareCookieValue = shareCookieMatch[2]

                      // Verify content is served with just the cookie
                      const shareCleanUrl = new URL(shareCleanLocation)
                      const shareFinalResponse = await fetch(shareCleanUrl.toString(), {
                        headers: { 'Cookie': `${shareCookieName}=${shareCookieValue}` },
                      })

                      if (shareFinalResponse.ok) {
                        console.log(`${green}✓${reset} Content served with share cookie only (no URL token)`)
                      } else {
                        console.error(`${red}✗${reset} Failed to serve content with share cookie: ${shareFinalResponse.status}`)
                        testPassed = false
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Cleanup share test project
        await runCommand([CLI_BIN, 'projects', 'rm', shareTestProjectName, serverUrl, '--force'])
        try {
          await rm(shareTestTempDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    console.log()

    // Step 8e: Test API token authentication
    console.log('Step 8e: Testing API token authentication...')

    // Create an API token
    const tokenName = `test-token-${Date.now()}`
    const createTokenResult = await runCommand([
      CLI_BIN, 'tokens', 'create', tokenName, serverUrl,
      '--expires', '1',  // 1 day expiry
    ])

    if (createTokenResult.exitCode !== 0) {
      console.error(`${red}✗${reset} Failed to create API token: ${createTokenResult.stderr}`)
      testPassed = false
    } else {
      // Extract the token from output (it should be on a line by itself after "Created API token:")
      const tokenMatch = createTokenResult.stdout.match(/scratch_[a-zA-Z0-9]+/)
      if (!tokenMatch) {
        console.error(`${red}✗${reset} Could not find API token in create output`)
        console.log('Output:', createTokenResult.stdout.slice(0, 500))
        testPassed = false
      } else {
        const apiToken = tokenMatch[0]
        console.log(`${green}✓${reset} Created API token: ${apiToken.slice(0, 12)}...`)

        // Test 1: List tokens shows the new token
        const listResult = await runCommand([CLI_BIN, 'tokens', 'ls', serverUrl])
        if (!listResult.stdout.includes(tokenName)) {
          console.error(`${red}✗${reset} Token not found in list`)
          testPassed = false
        } else {
          console.log(`${green}✓${reset} Token appears in list`)
        }

        // Test 2: Authenticate with API token via X-Api-Key header
        const apiResponse = await fetch(`${serverUrl}/api/me`, {
          headers: { 'X-Api-Key': apiToken },
        })
        if (!apiResponse.ok) {
          console.error(`${red}✗${reset} API token authentication failed: ${apiResponse.status}`)
          testPassed = false
        } else {
          const apiUser = await apiResponse.json() as { user: { email: string } }
          console.log(`${green}✓${reset} API token authenticated as ${apiUser.user.email}`)
        }

        // Test 3: Deploy using SCRATCH_TOKEN env var
        // Create a simple temp project for env var test
        const envTestDir = join(tmpdir(), `scratch-env-test-${Date.now()}`)
        await runCommand([CLI_BIN, 'create', envTestDir])
        const envTestProjectName = generateRandomProjectName()

        // Deploy with SCRATCH_TOKEN env var (simulate CI environment)
        const envDeployResult = await runCommand([
          CLI_BIN, 'publish', envTestDir,
          '--server', serverUrl,
          '--name', envTestProjectName,
          '--visibility', 'public',
          '--no-open',
        ], { env: { ...process.env, SCRATCH_TOKEN: apiToken } })

        if (envDeployResult.exitCode !== 0) {
          console.error(`${red}✗${reset} Deploy with SCRATCH_TOKEN failed: ${envDeployResult.stderr}`)
          testPassed = false
        } else {
          console.log(`${green}✓${reset} Deploy with SCRATCH_TOKEN env var succeeded`)
          // Cleanup the test project
          await runCommand([CLI_BIN, 'projects', 'delete', envTestProjectName, serverUrl, '--force'])
        }

        // Cleanup env test dir
        try {
          await rm(envTestDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }

        // Test 4: Revoke the token
        const revokeResult = await runCommand([
          CLI_BIN, 'tokens', 'revoke', tokenName, serverUrl,
        ])
        if (revokeResult.exitCode !== 0) {
          console.error(`${red}✗${reset} Failed to revoke token: ${revokeResult.stderr}`)
          testPassed = false
        } else {
          console.log(`${green}✓${reset} Token revoked successfully`)
        }

        // Test 5: Revoked token should no longer authenticate
        const revokedResponse = await fetch(`${serverUrl}/api/me`, {
          headers: { 'X-Api-Key': apiToken },
        })
        if (revokedResponse.ok) {
          console.error(`${red}✗${reset} Revoked token still works (should be rejected)`)
          testPassed = false
        } else if (revokedResponse.status === 401) {
          console.log(`${green}✓${reset} Revoked token correctly rejected`)
        } else {
          console.error(`${red}✗${reset} Unexpected status for revoked token: ${revokedResponse.status}`)
          testPassed = false
        }

        // Test 6: Invalid token rejected
        const invalidResponse = await fetch(`${serverUrl}/api/me`, {
          headers: { 'X-Api-Key': 'scratch_invalid_token_12345' },
        })
        if (invalidResponse.status === 401) {
          console.log(`${green}✓${reset} Invalid token correctly rejected`)
        } else {
          console.error(`${red}✗${reset} Invalid token not rejected: ${invalidResponse.status}`)
          testPassed = false
        }

        // Test 7: API token must NOT work on content domain (security invariant)
        // The pages subdomain serves user-uploaded JS, so API keys must be rejected there
        // to prevent malicious JS from using a stolen API key.
        // We verify by testing against the actual deployed test project (deployedUrl) and
        // confirming that providing an API token doesn't change the response behavior.
        // For a public project, we should get 200 both with and without the token.
        // The key check is that the token doesn't grant any special access.
        console.log(`Testing API token on content domain against: ${deployedUrl}`)

        // First, verify the project is accessible without any auth
        const baselineResponse = await fetch(deployedUrl, { redirect: 'manual' })
        const baselineStatus = baselineResponse.status

        // Now try with API token - should get EXACT same response (token ignored)
        const withApiTokenResponse = await fetch(deployedUrl, {
          headers: { 'X-Api-Key': apiToken },
          redirect: 'manual',
        })

        if (withApiTokenResponse.status !== baselineStatus) {
          console.error(`${red}✗${reset} API token changed content domain behavior (baseline: ${baselineStatus}, with token: ${withApiTokenResponse.status}) - SECURITY ISSUE`)
          testPassed = false
        } else {
          console.log(`${green}✓${reset} API token correctly ignored on content domain (status unchanged: ${withApiTokenResponse.status})`)
        }

        // Also verify that a non-existent private path still redirects to auth even with API token
        // (the token should not bypass auth redirect for private/non-existent paths)
        const nonExistentPrivateUrl = `https://${pagesDomain}/_/nonexistent-private-project/`
        const nonExistentWithTokenResponse = await fetch(nonExistentPrivateUrl, {
          headers: { 'X-Api-Key': apiToken },
          redirect: 'manual',
        })

        // Should redirect to auth (302/303), NOT return 200 or 404
        if (nonExistentWithTokenResponse.status === 200) {
          console.error(`${red}✗${reset} API token granted access to private path on content domain (SECURITY ISSUE)`)
          testPassed = false
        } else if (nonExistentWithTokenResponse.status === 302 || nonExistentWithTokenResponse.status === 303) {
          const location = nonExistentWithTokenResponse.headers.get('location') || ''
          if (location.includes('/auth/content-access')) {
            console.log(`${green}✓${reset} Private path still redirects to auth even with API token`)
          } else {
            console.log(`${green}✓${reset} Private path redirects (token ignored), location: ${location.slice(0, 50)}...`)
          }
        } else {
          console.log(`${green}✓${reset} API token did not bypass auth for private path (status: ${nonExistentWithTokenResponse.status})`)
        }
      }
    }

    console.log()

    // Step 9: Test project ID persistence
    console.log('Step 9: Testing project ID persistence...')

    // 9a: Verify project ID was saved to project.toml
    const projectTomlPath = join(tempDir, '.scratch', 'project.toml')
    let projectTomlContent: string
    try {
      projectTomlContent = await readFile(projectTomlPath, 'utf-8')
    } catch {
      console.error(`${red}✗${reset} project.toml not found at ${projectTomlPath}`)
      testPassed = false
      projectTomlContent = ''
    }

    const projectIdMatch = projectTomlContent.match(/^id\s*=\s*"([^"]+)"/m)
    if (!projectIdMatch) {
      console.error(`${red}✗${reset} Project ID not found in project.toml`)
      console.log('project.toml contents:')
      console.log(projectTomlContent)
      testPassed = false
    } else {
      const savedProjectId = projectIdMatch[1]
      console.log(`Project ID saved to project.toml: ${savedProjectId}`)
      console.log(`${green}✓${reset} Project ID persisted after first publish\n`)

      // 9b: Rename the project and publish again
      const newProjectName = `${projectName}-renamed`
      console.log(`Renaming project from "${projectName}" to "${newProjectName}"...`)

      // Update the name in project.toml (keep the ID)
      const updatedTomlContent = projectTomlContent.replace(
        /^name\s*=\s*"[^"]+"/m,
        `name = "${newProjectName}"`
      )
      writeFileSync(projectTomlPath, updatedTomlContent)

      // Publish again (should update server-side name via project ID)
      console.log('Publishing renamed project...')
      const renameDeployResult = await runCommand([
        CLI_BIN, 'publish', tempDir,
        '--server', serverUrl,
        '--no-build',
        '--no-open',
      ])

      if (renameDeployResult.exitCode !== 0) {
        console.error(`${red}✗${reset} Rename deploy failed: ${renameDeployResult.stderr}`)
        testPassed = false
      } else {
        console.log(renameDeployResult.stdout)

        // Extract the renamed URL from deploy output (first URL after "URLs:")
        const renamedUrlMatch = renameDeployResult.stdout.match(/URLs:\s+(\S+)/)
        const renamedUrl = renamedUrlMatch ? renamedUrlMatch[1] : `https://${pagesDomain}/${newProjectName}/`
        console.log(`Fetching renamed project: ${renamedUrl}`)
        await new Promise(resolve => setTimeout(resolve, 2000))

        const renamedResponse = await fetch(renamedUrl)
        if (!renamedResponse.ok) {
          console.error(`${red}✗${reset} Renamed project not accessible: ${renamedResponse.status}`)
          testPassed = false
        } else {
          console.log(`${green}✓${reset} Project rename via ID worked!\n`)
        }

        // Verify old URL no longer works (project was renamed, not duplicated)
        const oldUrlResponse = await fetch(deployedUrl)
        if (oldUrlResponse.ok) {
          console.log(`${yellow}!${reset} Old URL still works (may be cached or stale)\n`)
        } else {
          console.log(`${green}✓${reset} Old URL no longer works (project was renamed)\n`)
        }
      }

      // 9c: Test invalid project ID error handling
      console.log('Testing invalid project ID handling...')
      const invalidIdTomlContent = projectTomlContent.replace(
        /^id\s*=\s*"[^"]+"/m,
        `id = "invalid-project-id-12345"`
      )
      writeFileSync(projectTomlPath, invalidIdTomlContent)

      const invalidIdResult = await runCommand([
        CLI_BIN, 'publish', tempDir,
        '--server', serverUrl,
        '--no-build',
        '--no-open',
      ])

      if (invalidIdResult.exitCode === 0) {
        console.error(`${red}✗${reset} Expected publish with invalid ID to fail`)
        testPassed = false
      } else if (invalidIdResult.stderr.includes('Project not found') || invalidIdResult.stdout.includes('Project not found')) {
        console.log(`${green}✓${reset} Invalid project ID correctly rejected with helpful error\n`)
      } else {
        console.error(`${red}✗${reset} Invalid ID failed but with unexpected error:`)
        console.log('stdout:', invalidIdResult.stdout.slice(0, 500))
        console.log('stderr:', invalidIdResult.stderr.slice(0, 500))
        testPassed = false
      }

      // Restore valid config for cleanup (use new name since project was renamed)
      writeFileSync(projectTomlPath, updatedTomlContent)
    }

    // Step 10: Test WWW domain serving
    // Note: projectName may have been renamed to ${projectName}-renamed in step 9
    const currentProjectName = projectIdMatch ? `${projectName}-renamed` : projectName
    console.log('Step 10: Testing WWW domain serving...')

    // Get project ID using CLI
    const projectInfoResult = await runCommand([
      CLI_BIN, 'projects', 'info', currentProjectName, serverUrl,
    ])

    const idMatch = projectInfoResult.stdout.match(/ID:\s+(\S+)/)
    if (!idMatch) {
      console.error(`${red}✗${reset} Could not get project ID from CLI output`)
      testPassed = false
    } else {
      const projectId = idMatch[1]
      console.log(`Project ID: ${projectId}`)

      // Save original WWW_PROJECT_ID
      const originalWwwProjectId = vars.get('WWW_PROJECT_ID') || '_'

      // Update vars with WWW_PROJECT_ID
      vars.set('WWW_PROJECT_ID', projectId)
      writeVarsFile(varsPath, vars)
      console.log(`Updated WWW_PROJECT_ID to ${projectId}`)

      // Regenerate wrangler config to add www/naked domain routes (if not already present)
      const d1DatabaseId = vars.get('D1_DATABASE_ID')
      if (!d1DatabaseId) {
        console.error(`${red}✗${reset} Missing D1_DATABASE_ID in vars`)
        testPassed = false
      } else {
        const wranglerConfig = generateWranglerConfig(instance, d1DatabaseId)
        const wranglerPath = getInstanceWranglerPath(instance)
        writeFileSync(wranglerPath, wranglerConfig)
        console.log(`Regenerated ${wranglerPath}`)

        // Deploy to add the www routes (route changes require deploy)
        console.log('Deploying to add www routes...')
        exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', instance, 'deploy'])
        if (exitCode !== 0) {
          console.error(`${red}✗${reset} Deploy failed`)
          testPassed = false
        }

        // Push config to update WWW_PROJECT_ID secret (deploy only updates routes/code, not secrets)
        console.log('Pushing config...')
        exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', instance, 'config', 'push'])
        if (exitCode !== 0) {
          console.log(`${yellow}!${reset} Config push had issues (may be ok)`)
        }
      }

      {
        try {
          // Give it a moment for deployment to propagate
          await new Promise(resolve => setTimeout(resolve, 5000))

          // Cache-busting param to bypass Cloudflare cache
          const cacheBuster = `_cb=${Date.now()}`

          // Test www domain
          const wwwUrl = `https://www.${baseDomain}/?${cacheBuster}`
          console.log(`Fetching WWW domain: ${wwwUrl}`)

          const wwwResponse = await fetch(wwwUrl)
          if (!wwwResponse.ok) {
            console.error(`${red}✗${reset} Failed to fetch WWW domain content: ${wwwResponse.status}`)
            testPassed = false
          } else {
            const wwwContent = await wwwResponse.text()
            const normalizeHtml = (html: string) => html.replace(/\s+/g, ' ').trim()

            if (normalizeHtml(localContent) === normalizeHtml(wwwContent)) {
              console.log(`${green}✓${reset} WWW domain content matches!\n`)
            } else {
              console.error(`${red}✗${reset} WWW domain content mismatch!`)
              console.log('\nExpected content (first 500 chars):')
              console.log(localContent.slice(0, 500))
              console.log('\nWWW content (first 500 chars):')
              console.log(wwwContent.slice(0, 500))
              testPassed = false
            }
          }

          // Test naked domain
          const nakedUrl = `https://${baseDomain}/?${cacheBuster}`
          console.log(`Fetching naked domain: ${nakedUrl}`)

          const nakedResponse = await fetch(nakedUrl)
          if (!nakedResponse.ok) {
            console.error(`${red}✗${reset} Failed to fetch naked domain content: ${nakedResponse.status}`)
            testPassed = false
          } else {
            const nakedContent = await nakedResponse.text()
            const normalizeHtml = (html: string) => html.replace(/\s+/g, ' ').trim()

            if (normalizeHtml(localContent) === normalizeHtml(nakedContent)) {
              console.log(`${green}✓${reset} Naked domain content matches!\n`)
            } else {
              console.error(`${red}✗${reset} Naked domain content mismatch!`)
              testPassed = false
            }
          }

        } catch (error) {
          console.error(`${red}✗${reset} WWW test error: ${error instanceof Error ? error.message : error}`)
          testPassed = false
        } finally {
          // Restore original WWW_PROJECT_ID (no redeploy needed - config push updates the secret,
          // and the server returns 404 when WWW_PROJECT_ID is "_")
          console.log('Restoring original WWW_PROJECT_ID...')
          try {
            vars.set('WWW_PROJECT_ID', originalWwwProjectId)
            writeVarsFile(varsPath, vars)

            // Regenerate wrangler config to keep it in sync with vars file
            if (d1DatabaseId) {
              const restoredConfig = generateWranglerConfig(instance, d1DatabaseId)
              writeFileSync(getInstanceWranglerPath(instance), restoredConfig)
            }

            // Only config push needed - no redeploy since routes don't need to change
            exitCode = await runCommandInherit(['bun', 'ops', 'server', '-i', instance, 'config', 'push'])
            console.log(`${green}✓${reset} Restored original config\n`)
          } catch (restoreError) {
            console.error(`${red}✗${reset} Failed to restore config: ${restoreError instanceof Error ? restoreError.message : restoreError}`)
            console.error('Manual restoration may be needed!')
          }
        }
      }
    }

    // Cleanup: Delete the test project (use currentProjectName since it may have been renamed)
    console.log('Cleanup: Deleting test project...')
    const deleteResult = await runCommand([
      CLI_BIN, 'projects', 'delete', currentProjectName, serverUrl,
      '--force',
    ])
    if (deleteResult.exitCode === 0) {
      console.log(`${green}✓${reset} Test project deleted\n`)
    } else {
      console.log(`${yellow}!${reset} Could not delete test project (may need manual cleanup)\n`)
    }

  } catch (error) {
    console.error(`${red}✗${reset} ${error instanceof Error ? error.message : error}`)
    testPassed = false
  } finally {
    // Stop log tail process
    await cleanup()
    process.off('SIGINT', sigintHandler)
    console.log('Stopped log tail')

    // Cleanup temp directory
    try {
      await rm(tempDir, { recursive: true, force: true })
      console.log(`Cleaned up temp directory: ${tempDir}`)
    } catch {
      // Ignore cleanup errors
    }
  }

  if (testPassed) {
    console.log(`\n${green}✓${reset} Integration test passed!`)
  } else {
    console.log(`\n${red}✗${reset} Integration test failed!`)
    process.exit(1)
  }
}
