const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g;

export function extractUrls(text: string): string[] {
  if (!text) return [];
  return text.match(URL_PATTERN) || [];
}

export function pickDeployUrl(text: string, provider: 'vercel' | 'cloudflare'): string | null {
  const urls = extractUrls(text);
  if (urls.length === 0) return null;

  if (provider === 'vercel') {
    const vercelUrl = urls.find((url) => /\.vercel\.app\/?$/.test(url));
    if (vercelUrl) return sanitizeUrl(vercelUrl);
  }

  if (provider === 'cloudflare') {
    const pagesUrl = urls.find((url) => /\.pages\.dev\/?$/.test(url));
    if (pagesUrl) return sanitizeUrl(pagesUrl);
  }

  return urls[0] ? sanitizeUrl(urls[0]) : null;
}

export function sanitizeUrl(url: string): string {
  return url.replace(/[),.;]+$/, '');
}

export function ensureHttpsUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Could not parse deploy URL: ${url}`);
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  return sanitizeUrl(parsed.toString());
}
