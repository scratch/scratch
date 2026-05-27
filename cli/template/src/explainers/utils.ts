import type { Tone } from './types';

export function toneClass(tone: Tone | undefined) {
  return tone ? `tone-${tone}` : undefined;
}
