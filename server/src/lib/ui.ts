/**
 * Server-rendered UI pages
 *
 * These pages are rendered directly by the server with zero client-side JS.
 * All CSS is inlined for single HTTP request rendering.
 */

import { UI_CSS } from './ui-styles'
import { LOGO_SVG } from './ui-logo'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function baseHtml(title: string, content: string, preconnect?: string[]): string {
  const preconnectTags = preconnect?.map(url =>
    `<link rel="preconnect" href="${url}" crossorigin>`
  ).join('') || ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${preconnectTags}
<style>${UI_CSS}</style>
</head>
<body>${content}</body>
</html>`
}

function logo(): string {
  return LOGO_SVG
}

export function renderHomePage(user: { email: string; name?: string | null } | null): string {
  let content: string

  if (user) {
    content = `
<div class="page">
  ${logo()}
  <div class="user-card">
    <p class="label">Logged in as</p>
    <p class="user-email">${escapeHtml(user.email)}</p>
    ${user.name ? `<p class="user-name">${escapeHtml(user.name)}</p>` : ''}
  </div>
  <a href="/auth/logout" class="text-link">Log out</a>
</div>`
  } else {
    content = `
<div class="page">
  ${logo()}
  <p class="text-muted tagline">A simple tool for writing with Markdown and React.</p>
  <a href="/auth/login" class="btn btn-primary">Log in with Google</a>
</div>`
  }

  return baseHtml('Scratch', content)
}

export function renderErrorPage(message: string): string {
  const content = `
<div class="page">
  ${logo()}
  <h1>Error</h1>
  <div class="alert alert-error">
    <p>${escapeHtml(message)}</p>
  </div>
  <a href="/" class="text-link">Go home</a>
</div>`

  return baseHtml('Error - Scratch', content)
}

export function renderDevicePage(code: string, userEmail: string, state?: string): string {
  // If state is provided, use /cli-login endpoint (new simple flow)
  // Otherwise use /device endpoint (legacy BetterAuth device flow)
  const formAction = state ? '/cli-login' : '/device'
  const hiddenFields = state
    ? `<input type="hidden" name="code" value="${escapeHtml(code)}"><input type="hidden" name="state" value="${escapeHtml(state)}">`
    : `<input type="hidden" name="user_code" value="${escapeHtml(code)}">`

  const content = `
<div class="page">
  ${logo()}
  <h1>Authorize Device</h1>
  <div class="device-approval">
    <p class="text-muted">A device is trying to sign in to your account.</p>
    <p class="label">Verification code:</p>
    <div class="code-display">
      <code>${escapeHtml(code)}</code>
    </div>
    <p class="text-muted text-sm">Make sure this matches the code shown in your terminal.</p>
    <p class="text-muted text-sm">Logged in as ${escapeHtml(userEmail)}</p>
    <form method="POST" action="${formAction}">
      ${hiddenFields}
      <div class="button-row">
        <button type="submit" name="action" value="approve" class="btn btn-primary">Approve</button>
        <button type="submit" name="action" value="deny" class="btn btn-danger">Deny</button>
      </div>
    </form>
  </div>
</div>`

  return baseHtml('Authorize Device - Scratch', content)
}

export function renderDeviceErrorPage(message: string): string {
  const content = `
<div class="page">
  ${logo()}
  <h1>Authorize Device</h1>
  <div class="alert alert-error">
    <p>${escapeHtml(message)}</p>
  </div>
  <a href="/" class="text-link">Go home</a>
</div>`

  return baseHtml('Error - Scratch', content)
}

export function renderDeviceSuccessPage(approved: boolean): string {
  const alertClass = approved ? 'alert-success' : 'alert-error'
  const message = approved
    ? 'The device has been authorized. You can close this window and return to your terminal.'
    : 'The device authorization was denied. You can close this window.'

  const content = `
<div class="page">
  ${logo()}
  <h1>Device Authorization</h1>
  <div class="alert ${alertClass}">
    <p>${message}</p>
  </div>
</div>`

  return baseHtml('Device Authorization - Scratch', content)
}

