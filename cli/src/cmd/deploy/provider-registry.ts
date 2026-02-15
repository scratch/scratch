import { cloudflareProvider } from './providers/cloudflare';
import { vercelProvider } from './providers/vercel';
import { DeployProvider, DeployProviderName } from './types';

const PROVIDERS: Record<DeployProviderName, DeployProvider> = {
  vercel: vercelProvider,
  cloudflare: cloudflareProvider,
};

export function listProviders(): DeployProviderName[] {
  return Object.keys(PROVIDERS) as DeployProviderName[];
}

export function getProvider(name: string): DeployProvider {
  const normalized = name.toLowerCase();

  if (normalized === 'cloudflare-pages' || normalized === 'cf') {
    return PROVIDERS.cloudflare;
  }

  if (normalized in PROVIDERS) {
    return PROVIDERS[normalized as DeployProviderName];
  }

  throw new Error(
    `Unsupported provider: ${name}. Supported providers: ${listProviders().join(', ')}`
  );
}
