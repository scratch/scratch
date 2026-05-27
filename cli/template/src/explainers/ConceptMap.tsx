import React from 'react';
import { toneClass } from './utils';
import type { ConceptMapProps } from './types';

export function ConceptMap({ title = 'Concept map', items }: ConceptMapProps) {
  return (
    <section className="not-prose scratch-concept-map">
      <h3>{title}</h3>
      <dl>
        {items.map((item, index) => (
          <div key={index} className={toneClass(item.tone)}>
            <dt>{item.concept}</dt>
            <dd>{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default ConceptMap;
