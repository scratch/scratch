import { describe, test, expect, mock, beforeEach } from 'bun:test'
import {
  findFile,
  serveFile,
  buildContentAccessRedirect,
  validateFilePath,
  authenticateContentRequest,
  type Project,
  type ContentAuthResult,
} from '../src/lib/content-serving'
import type { Env } from '../src/env'
import { createContentToken } from '../src/lib/content-token'

// Mock Hono context factory
function createMockContext(options: {
  url: string
  cookies?: Record<string, string>
  env?: Partial<Env>
  resHeaders?: Headers
}) {
  const cookies = options.cookies || {}
  const responseHeaders = options.resHeaders || new Headers()

  const mockContext = {
    req: {
      url: options.url,
      raw: {
        headers: new Headers(),
      },
    },
    env: {
      FILES: {} as R2Bucket,
      DB: {} as D1Database,
      D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012',
      BASE_DOMAIN: 'example.com',
      APP_SUBDOMAIN: 'app',
      CONTENT_SUBDOMAIN: 'pages',
      CLOUDFLARE_ZONE: 'example.com',
      WWW_PROJECT_ID: '_',
      BETTER_AUTH_SECRET: 'test-secret-key-that-is-long-enough-for-signing',
      AUTH_MODE: 'local',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      CLOUDFLARE_ACCESS_TEAM: '_',
      ALLOWED_USERS: 'public',
      MAX_VISIBILITY: 'public',
      ALLOW_SHARE_TOKENS: 'false',
      MAX_DEPLOY_SIZE: '10',
      ...options.env,
    } as Env,
    res: {
      headers: responseHeaders,
    },
    // Mock header method for setCookie
    header: (name: string, value: string, opts?: { append?: boolean }) => {
      if (opts?.append) {
        responseHeaders.append(name, value)
      } else {
        responseHeaders.set(name, value)
      }
    },
  }

  // Set cookie header for getCookie to read
  if (Object.keys(cookies).length > 0) {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
    mockContext.req.raw.headers.set('Cookie', cookieHeader)
  }

  return mockContext as unknown as import('hono').Context<{ Bindings: Env }>
}

// Helper to create a mock project
function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-123',
    name: 'test-project',
    owner_id: 'user-456',
    owner_email: 'owner@example.com',
    visibility: 'public',
    live_deploy_id: 'deploy-789',
    ...overrides,
  }
}

// Helper to create a mock R2 object
function createMockR2Object(content: string): R2ObjectBody {
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content))
        controller.close()
      },
    }),
    etag: '"abc123"',
    httpEtag: '"abc123"',
    key: 'test-key',
    size: content.length,
    version: 'v1',
    uploaded: new Date(),
    httpMetadata: {},
    customMetadata: {},
    checksums: { toJSON: () => ({}) },
    writeHttpMetadata: () => {},
    storageClass: 'Standard',
  } as unknown as R2ObjectBody
}

describe('content-serving', () => {
  describe('validateFilePath', () => {
    test('returns normalized path for valid input', () => {
      expect(validateFilePath('index.html')).toBe('index.html')
      expect(validateFilePath('docs/api/index.html')).toBe('docs/api/index.html')
    })

    test('returns empty string for empty input', () => {
      expect(validateFilePath('')).toBe('')
    })

    test('returns null for paths starting with slash (absolute paths)', () => {
      // isValidFilePath rejects absolute paths
      expect(validateFilePath('/pages/about')).toBeNull()
      expect(validateFilePath('/')).toBeNull()
    })

    test('returns null for invalid URL encoding', () => {
      expect(validateFilePath('%invalid')).toBeNull()
    })

    test('returns null for path traversal attempts', () => {
      expect(validateFilePath('../etc/passwd')).toBeNull()
      expect(validateFilePath('foo/../../bar')).toBeNull()
    })

    test('decodes URL-encoded paths', () => {
      expect(validateFilePath('hello%20world.html')).toBe('hello world.html')
      expect(validateFilePath('docs%2Fapi')).toBe('docs/api')
    })
  })

  describe('buildContentAccessRedirect', () => {
    test('builds correct redirect URL', () => {
      const env = {
        BASE_DOMAIN: 'example.com',
        APP_SUBDOMAIN: 'app',
      } as Env

      const redirectUrl = buildContentAccessRedirect(
        env,
        'project-123',
        'https://pages.example.com/owner/project/'
      )

      expect(redirectUrl).toBe(
        'https://app.example.com/auth/content-access?project_id=project-123&return_url=https%3A%2F%2Fpages.example.com%2Fowner%2Fproject%2F'
      )
    })

    test('handles localhost domains', () => {
      const env = {
        BASE_DOMAIN: 'localhost:3000',
        APP_SUBDOMAIN: 'app',
      } as Env

      const redirectUrl = buildContentAccessRedirect(env, 'project-123', 'http://localhost:3000/')

      expect(redirectUrl).toContain('http://app.localhost:3000/auth/content-access')
    })
  })

  describe('findFile', () => {
    test('finds index.html for root path', async () => {
      const mockR2 = {
        get: mock(async (key: string) => {
          if (key === 'deploy-123/index.html') {
            return createMockR2Object('<html>index</html>')
          }
          return null
        }),
      } as unknown as R2Bucket

      const result = await findFile(mockR2, 'deploy-123', '')

      expect(result).not.toBeNull()
      expect(result?.key).toBe('deploy-123/index.html')
    })

    test('tries multiple paths for directory', async () => {
      const mockR2 = {
        get: mock(async (key: string) => {
          // Only the direct file exists
          if (key === 'deploy-123/about') {
            return createMockR2Object('<html>about</html>')
          }
          return null
        }),
      } as unknown as R2Bucket

      const result = await findFile(mockR2, 'deploy-123', 'about')

      expect(result).not.toBeNull()
      expect(result?.key).toBe('deploy-123/about')
    })

    test('prefers index.html over direct path', async () => {
      const getMock = mock(async (key: string) => {
        if (key === 'deploy-123/docs/index.html') {
          return createMockR2Object('<html>docs index</html>')
        }
        if (key === 'deploy-123/docs') {
          return createMockR2Object('docs direct')
        }
        return null
      })
      const mockR2 = { get: getMock } as unknown as R2Bucket

      const result = await findFile(mockR2, 'deploy-123', 'docs')

      expect(result).not.toBeNull()
      expect(result?.key).toBe('deploy-123/docs/index.html')
    })

    test('returns null when file not found', async () => {
      const mockR2 = {
        get: mock(async () => null),
      } as unknown as R2Bucket

      const result = await findFile(mockR2, 'deploy-123', 'nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('serveFile', () => {
    test('returns response with correct content type', () => {
      const obj = createMockR2Object('<html></html>')
      const response = serveFile(obj, 'test.html')

      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    })

    test('includes etag header', () => {
      const obj = createMockR2Object('test')
      const response = serveFile(obj, 'test.txt')

      expect(response.headers.get('ETag')).toBe('"abc123"')
    })

    test('includes security headers', () => {
      const obj = createMockR2Object('test')
      const response = serveFile(obj, 'test.txt')

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    test('copies extra headers', () => {
      const obj = createMockR2Object('test')
      const extraHeaders = new Headers()
      extraHeaders.set('Set-Cookie', 'session=abc')

      const response = serveFile(obj, 'test.txt', extraHeaders)

      expect(response.headers.get('Set-Cookie')).toBe('session=abc')
    })
  })

  describe('authenticateContentRequest', () => {
    // Note: authenticateContentRequest is only called for NON-public projects.
    // The public project check happens in serveProjectContent before calling this function.
    // This function handles: content tokens, share tokens, and CF Access authentication.

    describe('with private project', () => {
      test('denies access without token', async () => {
        const c = createMockContext({
          url: 'https://pages.example.com/owner/project/',
        })
        const project = createMockProject({ visibility: 'private' })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(false)
        expect(result.user).toBeNull()
      })

      test('grants access with valid content token in URL', async () => {
        const project = createMockProject({
          visibility: 'private',
          owner_id: 'user-456',
        })

        // Create a valid content token
        const secret = 'test-secret-key-that-is-long-enough-for-signing'
        const token = await createContentToken('user-456', 'owner@example.com', project.id, secret)

        const c = createMockContext({
          url: `https://pages.example.com/owner/project/?_ctoken=${token}`,
          env: { BETTER_AUTH_SECRET: secret },
        })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(true)
        expect(result.user).not.toBeNull()
        expect(result.user?.email).toBe('owner@example.com')
        expect(result.tokenFromUrl).toBe(true)
      })

      test('grants access with valid content token in cookie', async () => {
        const project = createMockProject({
          visibility: 'private',
          owner_id: 'user-456',
        })

        const secret = 'test-secret-key-that-is-long-enough-for-signing'
        const token = await createContentToken('user-456', 'owner@example.com', project.id, secret)

        const c = createMockContext({
          url: 'https://pages.example.com/owner/project/',
          cookies: { _content_token: token },
          env: { BETTER_AUTH_SECRET: secret },
        })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(true)
        expect(result.user).not.toBeNull()
        expect(result.tokenFromUrl).toBe(false)
      })

      test('denies access with token for wrong project', async () => {
        const project = createMockProject({
          id: 'project-123',
          visibility: 'private',
        })

        const secret = 'test-secret-key-that-is-long-enough-for-signing'
        // Token is for a different project
        const token = await createContentToken('user-456', 'owner@example.com', 'other-project', secret)

        const c = createMockContext({
          url: `https://pages.example.com/owner/project/?_ctoken=${token}`,
          env: { BETTER_AUTH_SECRET: secret },
        })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(false)
        expect(result.user).toBeNull()
      })

      test('denies access with expired token', async () => {
        // We can't easily test expiration without time manipulation
        // but we can test invalid tokens
        const project = createMockProject({ visibility: 'private' })

        const c = createMockContext({
          url: 'https://pages.example.com/owner/project/?_ctoken=invalid-token',
        })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(false)
        expect(result.user).toBeNull()
      })
    })

    describe('with domain-restricted visibility', () => {
      test('grants access to user matching domain restriction', async () => {
        const project = createMockProject({
          visibility: '@example.com',
          owner_id: 'other-user',
        })

        const secret = 'test-secret-key-that-is-long-enough-for-signing'
        const token = await createContentToken('user-456', 'user@example.com', project.id, secret)

        const c = createMockContext({
          url: `https://pages.example.com/owner/project/?_ctoken=${token}`,
          env: { BETTER_AUTH_SECRET: secret, MAX_VISIBILITY: '@example.com' },
        })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(true)
        expect(result.user?.email).toBe('user@example.com')
      })

      test('denies access to user not matching domain restriction', async () => {
        const project = createMockProject({
          visibility: '@example.com',
          owner_id: 'other-user',
        })

        const secret = 'test-secret-key-that-is-long-enough-for-signing'
        const token = await createContentToken('user-456', 'user@otherdomain.com', project.id, secret)

        const c = createMockContext({
          url: `https://pages.example.com/owner/project/?_ctoken=${token}`,
          env: { BETTER_AUTH_SECRET: secret, MAX_VISIBILITY: '@example.com' },
        })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(false)
      })
    })

    describe('owner access', () => {
      test('owner always has access to their project', async () => {
        const project = createMockProject({
          visibility: 'private',
          owner_id: 'user-456',
        })

        const secret = 'test-secret-key-that-is-long-enough-for-signing'
        const token = await createContentToken('user-456', 'owner@example.com', project.id, secret)

        const c = createMockContext({
          url: `https://pages.example.com/owner/project/?_ctoken=${token}`,
          env: { BETTER_AUTH_SECRET: secret },
        })

        const result = await authenticateContentRequest(c, project, '/owner/project/')

        expect(result.hasAccess).toBe(true)
      })
    })
  })
})
