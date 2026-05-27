import React from 'react';
import { toneLabels } from './constants';
import type { Tone } from './types';

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span className={`scratch-status-badge scratch-status-badge--${tone}`}>
      {children || toneLabels[tone]}
    </span>
  );
}

export default StatusBadge;
