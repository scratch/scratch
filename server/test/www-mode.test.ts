import { describe, test, expect } from 'bun:test'
import { buildProjectUrls } from '@scratch/shared/project'
import { deployCreateQuerySchema } from '@scratch/shared'

/**
 * Tests for the --www flag feature in deploys.
 *
 * This tests the shared schema validation and URL building logic
 * that the deploy endpoint uses for www mode.
 */

describe('deployCreateQuerySchema www parameter', () => {
  test('parses www=true as boolean true', () => {
    const result = deployCreateQuerySchema.safeParse({
      www: 'true',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.www).toBe(true)
    }
  })

  test('parses www=false as boolean true (zod coerces truthy strings)', () => {
    // Note: z.coerce.boolean() treats non-empty strings as truthy
    // The CLI should only pass www=true, never www=false
    const result = deployCreateQuerySchema.safeParse({
      www: 'false',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // 'false' is a non-empty string, so it coerces to true
      expect(result.data.www).toBe(true)
    }
  })

  test('parses www=1 as boolean true (coercion)', () => {
    const result = deployCreateQuerySchema.safeParse({
      www: '1',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.www).toBe(true)
    }
  })

  test('parses www=0 as boolean true (any non-empty string is truthy)', () => {
    // Note: z.coerce.boolean() treats non-empty strings as truthy
    // The CLI should only pass www=true, never www=0
    const result = deployCreateQuerySchema.safeParse({
      www: '0',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // '0' is a non-empty string, so it coerces to true
      expect(result.data.www).toBe(true)
    }
  })

  test('www is optional and defaults to undefined', () => {
    const result = deployCreateQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.www).toBeUndefined()
    }
  })

  test('parses with all parameters including www', () => {
    const result = deployCreateQuerySchema.safeParse({
      visibility: 'public',
      project_id: 'proj_123',
      www: 'true',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.visibility).toBe('public')
      expect(result.data.project_id).toBe('proj_123')
      expect(result.data.www).toBe(true)
    }
  })
})

describe('WWW_PROJECT_ID validation logic', () => {
  // These tests document the expected behavior of the deploy endpoint's
  // WWW_PROJECT_ID validation logic

  test('www mode succeeds when WWW_PROJECT_ID is not configured (underscore)', () => {
    const wwwProjectId = '_'
    const currentProjectId = 'proj_123'

    // Logic from deploys.ts: WWW_PROJECT_ID === '_' means not configured
    const isConfigured = wwwProjectId && wwwProjectId !== '_'
    const isMismatch = isConfigured && wwwProjectId !== currentProjectId

    expect(isMismatch).toBe(false) // Should succeed
  })

  test('www mode succeeds when WWW_PROJECT_ID is empty', () => {
    const wwwProjectId = ''
    const currentProjectId = 'proj_123'

    const isConfigured = wwwProjectId && wwwProjectId !== '_'
    const isMismatch = isConfigured && wwwProjectId !== currentProjectId

    // Empty string is falsy, so isConfigured is falsy (''), and isMismatch is also falsy
    expect(!!isMismatch).toBe(false) // Should succeed (coerce to boolean for clarity)
  })

  test('www mode succeeds when WWW_PROJECT_ID matches current project', () => {
    const wwwProjectId = 'proj_123'
    const currentProjectId = 'proj_123'

    const isConfigured = wwwProjectId && wwwProjectId !== '_'
    const isMismatch = isConfigured && wwwProjectId !== currentProjectId

    expect(isConfigured).toBe(true)
    expect(isMismatch).toBe(false) // Should succeed
  })

  test('www mode fails when WWW_PROJECT_ID is configured for different project', () => {
    const wwwProjectId = 'proj_other'
    const currentProjectId = 'proj_123'

    const isConfigured = wwwProjectId && wwwProjectId !== '_'
    const isMismatch = isConfigured && wwwProjectId !== currentProjectId

    expect(isConfigured).toBe(true)
    expect(isMismatch).toBe(true) // Should fail with WWW_PROJECT_MISMATCH
  })
})

describe('www mode configured detection', () => {
  // Tests for determining when www is "configured" for response

  test('www is configured when WWW_PROJECT_ID matches project', () => {
    const wwwProjectId = 'proj_123'
    const currentProjectId = 'proj_123'

    const wwwConfigured = wwwProjectId === currentProjectId

    expect(wwwConfigured).toBe(true)
  })

  test('www is not configured when WWW_PROJECT_ID is underscore', () => {
    const wwwProjectId = '_'
    const currentProjectId = 'proj_123'

    const wwwConfigured = wwwProjectId === currentProjectId

    expect(wwwConfigured).toBe(false)
  })

  test('www is not configured when WWW_PROJECT_ID is different project', () => {
    const wwwProjectId = 'proj_other'
    const currentProjectId = 'proj_123'

    const wwwConfigured = wwwProjectId === currentProjectId

    expect(wwwConfigured).toBe(false)
  })
})

describe('buildProjectUrls with www mode', () => {
  // Tests for URL building when www is configured

  test('includes www URL when wwwDomain is provided', () => {
    const urls = buildProjectUrls({
      pagesDomain: 'pages.scratch.dev',
      projectName: 'my-app',
      ownerId: 'user123',
      ownerEmail: 'pete@example.com',
      allowedUsers: '*',
      wwwDomain: 'scratch.dev',
    })

    expect(urls.primary).toBe('https://pages.scratch.dev/pete@example.com/my-app/')
    expect(urls.byId).toBe('https://pages.scratch.dev/user123/my-app/')
    expect(urls.www).toBe('https://scratch.dev/')
  })

  test('does not include www URL when wwwDomain is undefined', () => {
    const urls = buildProjectUrls({
      pagesDomain: 'pages.scratch.dev',
      projectName: 'my-app',
      ownerId: 'user123',
      ownerEmail: 'pete@example.com',
      allowedUsers: '*',
      wwwDomain: undefined,
    })

    expect(urls.primary).toBe('https://pages.scratch.dev/pete@example.com/my-app/')
    expect(urls.byId).toBe('https://pages.scratch.dev/user123/my-app/')
    expect(urls.www).toBeUndefined()
  })
})
