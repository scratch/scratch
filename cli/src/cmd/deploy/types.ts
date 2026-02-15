export type DeployProviderName = 'vercel' | 'cloudflare';
export type DeployEnvironment = 'preview' | 'prod';

export interface DeployOptions {
  prod?: boolean;
  preview?: boolean;
  project?: string;
  org?: string;
  yes?: boolean;
  noBuild?: boolean;
  open?: boolean;
  json?: boolean;
}

export interface DeployResult {
  provider: DeployProviderName;
  environment: DeployEnvironment;
  project: string;
  url: string;
  duration_ms: number;
}

export interface ProviderDeployContext {
  rootDir: string;
  distDir: string;
  environment: DeployEnvironment;
  project: string;
  org?: string;
  nonInteractive: boolean;
}

export interface ProviderDeployResult {
  project?: string;
  url: string;
  rawOutput?: string;
}

export interface DeployProvider {
  name: DeployProviderName;
  description: string;
  validatePrerequisites: (ctx: ProviderDeployContext) => Promise<void>;
  deploy: (ctx: ProviderDeployContext) => Promise<ProviderDeployResult>;
}
