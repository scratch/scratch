// Version is read from package.json at build time
import pkg from '../package.json';

export const VERSION = pkg.version;
export const REPO = 'scratch/scratch';
export const GITHUB_API = `https://api.github.com/repos/${REPO}`;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
