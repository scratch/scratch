import type { ExplainerIntent, Tone } from './types';

export const intentLabels: Record<ExplainerIntent, string> = {
  'review-change': 'Review Change',
  'system-model': 'System Model',
  'feature-spec': 'Feature Spec',
  'general-concept': 'Concept',
  'data-model': 'Data Model',
  'bug-incident': 'Bug / Incident',
};

export const toneLabels: Record<Tone, string> = {
  neutral: 'Neutral',
  good: 'Good',
  warn: 'Watch',
  bad: 'Risk',
  partial: 'Partial',
  info: 'Info',
};
