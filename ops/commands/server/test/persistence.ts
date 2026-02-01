// Project ID persistence tests - Step 9

import { describe, test, expect } from 'bun:test'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { getContext, CLI_BIN, green, yellow, reset } from './context'
import { runCommand } from '../../../lib/process'

export function persistenceTests() {
  describe('Step 9: Project ID persistence', () => {
    let projectTomlContent: string
    let savedProjectId: string

    test('Step 9a: project ID was saved to project.toml', async () => {
      const ctx = getContext()
      console.log('Step 9: Testing project ID persistence...')

      const projectTomlPath = join(ctx.projectDir, '.scratch', 'project.toml')
      projectTomlContent = await readFile(projectTomlPath, 'utf-8')

      const projectIdMatch = projectTomlContent.match(/^id\s*=\s*"([^"]+)"/m)
      expect(projectIdMatch).toBeTruthy()

      savedProjectId = projectIdMatch![1]
      console.log(`Project ID saved to project.toml: ${savedProjectId}`)
      console.log(`${green}✓${reset} Project ID persisted after first publish\n`)
    })

    test('Step 9b: rename project and publish again', async () => {
      const ctx = getContext()
      const newProjectName = `${ctx.projectName}-renamed`
      console.log(`Renaming project from "${ctx.projectName}" to "${newProjectName}"...`)

      // Update the name in project.toml (keep the ID)
      const projectTomlPath = join(ctx.projectDir, '.scratch', 'project.toml')
      const updatedTomlContent = projectTomlContent.replace(
        /^name\s*=\s*"[^"]+"/m,
        `name = "${newProjectName}"`
      )
      writeFileSync(projectTomlPath, updatedTomlContent)

      // Publish again (should update server-side name via project ID)
      console.log('Publishing renamed project...')
      const renameDeployResult = await runCommand([
        CLI_BIN, 'publish', ctx.projectDir,
        '--server', ctx.serverUrl,
        '--no-build',
        '--no-open',
      ])

      expect(renameDeployResult.exitCode).toBe(0)
      console.log(renameDeployResult.stdout)

      // Update currentProjectName for cleanup
      ctx.currentProjectName = newProjectName

      // Extract the renamed URL from deploy output (first URL after "URLs:")
      const renamedUrlMatch = renameDeployResult.stdout.match(/URLs:\s+(\S+)/)
      const renamedUrl = renamedUrlMatch ? renamedUrlMatch[1] : `https://${ctx.pagesDomain}/${newProjectName}/`
      console.log(`Fetching renamed project: ${renamedUrl}`)
      await new Promise(resolve => setTimeout(resolve, 2000))

      const renamedResponse = await fetch(renamedUrl)
      expect(renamedResponse.ok).toBe(true)
      console.log(`${green}✓${reset} Project rename via ID worked!\n`)

      // Verify old URL no longer works (project was renamed, not duplicated)
      const oldUrlResponse = await fetch(ctx.deployedUrl)
      if (oldUrlResponse.ok) {
        console.log(`${yellow}!${reset} Old URL still works (may be cached or stale)\n`)
      } else {
        console.log(`${green}✓${reset} Old URL no longer works (project was renamed)\n`)
      }
    })

    test('Step 9c: invalid project ID error handling', async () => {
      const ctx = getContext()
      console.log('Testing invalid project ID handling...')

      const projectTomlPath = join(ctx.projectDir, '.scratch', 'project.toml')
      const invalidIdTomlContent = projectTomlContent.replace(
        /^id\s*=\s*"[^"]+"/m,
        `id = "invalid-project-id-12345"`
      )
      writeFileSync(projectTomlPath, invalidIdTomlContent)

      const invalidIdResult = await runCommand([
        CLI_BIN, 'publish', ctx.projectDir,
        '--server', ctx.serverUrl,
        '--no-build',
        '--no-open',
      ])

      expect(invalidIdResult.exitCode).not.toBe(0)

      const hasHelpfulError = invalidIdResult.stderr.includes('Project not found') || invalidIdResult.stdout.includes('Project not found')
      expect(hasHelpfulError).toBe(true)
      console.log(`${green}✓${reset} Invalid project ID correctly rejected with helpful error\n`)

      // Restore valid config for cleanup (use new name since project was renamed)
      const newProjectName = `${ctx.projectName}-renamed`
      const restoredTomlContent = projectTomlContent.replace(
        /^name\s*=\s*"[^"]+"/m,
        `name = "${newProjectName}"`
      )
      writeFileSync(projectTomlPath, restoredTomlContent)
    })
  })
}
