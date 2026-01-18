// Domain helpers - compute full domains from BASE_DOMAIN + subdomain config

import type { Env } from '../env'

/**
 * Check if running in localhost dev mode
 */
export function isLocalhost(env: Env): boolean {
  return env.BASE_DOMAIN === 'localhost' || env.BASE_DOMAIN.startsWith('localhost:')
}

/**
 * Get the full app domain (e.g., "app.example.com" or "localhost:8788")
 */
export function getAppDomain(env: Env): string {
  return `${env.APP_SUBDOMAIN}.${env.BASE_DOMAIN}`
}

/**
 * Get the full content domain (e.g., "pages.example.com" or "localhost:8787")
 */
export function getContentDomain(env: Env): string {
  return `${env.CONTENT_SUBDOMAIN}.${env.BASE_DOMAIN}`
}

/**
 * Get the base URL for the app (e.g., "https://app.example.com")
 */
export function getAppBaseUrl(env: Env): string {
  const domain = getAppDomain(env)
  const protocol = isLocalhost(env) ? 'http' : 'https'
  return `${protocol}://${domain}`
}

/**
 * Get the base URL for content (e.g., "https://pages.example.com")
 */
export function getContentBaseUrl(env: Env): string {
  const domain = getContentDomain(env)
  const protocol = isLocalhost(env) ? 'http' : 'https'
  return `${protocol}://${domain}`
}

/**
 * Check if HTTPS should be used (true unless localhost)
 */
export function useHttps(env: Env): boolean {
  return !isLocalhost(env)
}

/**
 * Get the www domain (e.g., "www.example.com")
 */
export function getWwwDomain(env: Env): string {
  return `www.${env.BASE_DOMAIN}`
}

/**
 * Get the root/naked domain (e.g., "example.com")
 */
export function getRootDomain(env: Env): string {
  return env.BASE_DOMAIN
}

/**
 * Check if host matches the www or root domain (for WWW_PROJECT_ID routing)
 */
export function isWwwOrRootDomain(host: string, env: Env): boolean {
  const wwwDomain = getWwwDomain(env).toLowerCase()
  const rootDomain = getRootDomain(env).toLowerCase()
  const normalizedHost = host.toLowerCase()
  return normalizedHost === wwwDomain || normalizedHost === rootDomain
}
