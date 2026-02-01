// Domain helpers - compute full domains from BASE_DOMAIN + subdomain config

import type { Env } from '../env'

/**
 * Check if running in localhost dev mode
 */
export function isLocalhost(env: Env): boolean {
  return env.BASE_DOMAIN === 'localhost' || env.BASE_DOMAIN.startsWith('localhost:')
}

/**
 * Build a full URL from a domain and environment (uses http for localhost, https otherwise)
 */
function buildBaseUrl(domain: string, env: Env): string {
  const protocol = isLocalhost(env) ? 'http' : 'https'
  return `${protocol}://${domain}`
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
  const domain = `${env.APP_SUBDOMAIN}.${env.BASE_DOMAIN}`
  return buildBaseUrl(domain, env)
}

/**
 * Get the base URL for content (e.g., "https://pages.example.com")
 */
export function getContentBaseUrl(env: Env): string {
  return buildBaseUrl(getContentDomain(env), env)
}

/**
 * Check if HTTPS should be used (true unless localhost)
 */
export function useHttps(env: Env): boolean {
  return !isLocalhost(env)
}

/**
 * Get the root domain (e.g., "example.com" or "localhost:8787")
 */
export function getRootDomain(env: Env): string {
  return env.BASE_DOMAIN
}

/**
 * Check if host matches the www or root domain (for WWW_PROJECT_ID routing)
 */
export function isWwwOrRootDomain(host: string, env: Env): boolean {
  const wwwDomain = `www.${env.BASE_DOMAIN}`.toLowerCase()
  const rootDomain = env.BASE_DOMAIN.toLowerCase()
  const normalizedHost = host.toLowerCase()
  return normalizedHost === wwwDomain || normalizedHost === rootDomain
}
