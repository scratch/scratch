import React from 'react';
import { ChevronDown, SearchCheck } from 'lucide-react';
import { toneClass } from './utils';
import type { EvidencePanelProps } from './types';

export function EvidencePanel({ title = 'Evidence inspected', items }: EvidencePanelProps) {
  return (
    <details className="not-prose scratch-evidence-panel">
      <summary className="scratch-icon-heading">
        <SearchCheck aria-hidden="true" />
        <span>{title}</span>
        <ChevronDown className="scratch-evidence-toggle-icon" aria-hidden="true" />
      </summary>
      <dl>
        {items.map((item) => (
          <div key={item.label} className={toneClass(item.tone)}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default EvidencePanel;
