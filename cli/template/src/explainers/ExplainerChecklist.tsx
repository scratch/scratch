import React from 'react';
import { ListChecks } from 'lucide-react';
import { toneClass } from './utils';
import type { ExplainerChecklistProps } from './types';

export function ExplainerChecklist({ title, items }: ExplainerChecklistProps) {
  return (
    <section className="not-prose scratch-layout-card">
      <h3 className="scratch-icon-heading">
        <ListChecks aria-hidden="true" />
        {title}
      </h3>
      <dl className="scratch-layout-list">
        {items.map((item) => (
          <div key={item.label} className={toneClass(item.tone)}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default ExplainerChecklist;
