import React from 'react';
import { toneClass } from './utils';
import type { ExplainerMetaProps } from './types';

export function ExplainerMeta({ date, published, items = [] }: ExplainerMetaProps) {
  return (
    <div className="not-prose scratch-layout-meta">
      <span>Date: {date}</span>
      <span>Published: {published ? 'true' : 'false'}</span>
      {items.map((item) => (
        <span key={item.label} className={toneClass(item.tone)}>
          {item.label}: {item.value}
        </span>
      ))}
    </div>
  );
}

export default ExplainerMeta;
