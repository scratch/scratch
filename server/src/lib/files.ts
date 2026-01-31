// File handling utilities for static file serving

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mdx': 'text/plain; charset=utf-8',
  '.sh': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
}

export function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

// Normalize file path before validation
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/') // Backslash to forward slash
    .replace(/\/+/g, '/') // Collapse multiple slashes
    .replace(/^\.\//, '') // Remove leading ./
    .replace(/\/\.\//g, '/') // Remove /./ in middle
}

// Validate a file path from a zip archive
export function isValidFilePath(path: string): boolean {
  if (!path || path.length > 500) return false
  if (path.includes('..')) return false // No traversal
  if (path.startsWith('/')) return false // No absolute
  if (path.includes('\\')) return false // No backslash
  if (path.includes('\0')) return false // No null bytes
  if (/[<>:"|?*]/.test(path)) return false // No special chars
  return true
}

// Get cache control header based on content type
export function getCacheControl(path: string): string {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()

  // HTML - short TTL, allows quick updates after deploy
  if (ext === '.html') {
    return 'public, max-age=60, s-maxage=300'
  }

  // Immutable assets (hashed filenames) - long TTL
  // Pattern: filename.abc123.ext or filename-abc123.ext
  if (/\.[a-f0-9]{8,}\./.test(path) || /-[a-f0-9]{8,}\./.test(path)) {
    return 'public, max-age=31536000, immutable'
  }

  // Static assets - medium TTL
  if (['.css', '.js', '.mjs', '.woff', '.woff2', '.ttf', '.otf'].includes(ext)) {
    return 'public, max-age=3600, s-maxage=86400'
  }

  // Images/media - medium-long TTL
  if (
    ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif', '.mp4', '.webm', '.mp3', '.wav'].includes(ext)
  ) {
    return 'public, max-age=86400, s-maxage=604800'
  }

  // Default
  return 'public, max-age=3600'
}

// Standard security headers for all responses
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
}
