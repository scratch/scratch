import React from 'react';
import { Quote } from 'lucide-react';
import { toneClass } from './utils';
import type { SourceCalloutProps } from './types';

export function SourceCallout({ source, children, tone = 'info' }: SourceCalloutProps) {
  return (
    <aside className={`not-prose scratch-source-callout ${toneClass(tone) || ''}`}>
      <p className="scratch-icon-label">
        <Quote aria-hidden="true" />
        Source
      </p>
      <strong>{source}</strong>
      <div>{children}</div>
    </aside>
  );
}

export default SourceCallout;
