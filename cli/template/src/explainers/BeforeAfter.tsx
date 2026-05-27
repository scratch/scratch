import React from 'react';
import type { BeforeAfterProps } from './types';

export function BeforeAfter({
  beforeTitle = 'Before',
  afterTitle = 'After',
  before,
  after,
}: BeforeAfterProps) {
  return (
    <div className="not-prose scratch-before-after">
      <section className="scratch-before-after-panel scratch-before-after-panel--before">
        <h3>{beforeTitle}</h3>
        <div>{before}</div>
      </section>
      <section className="scratch-before-after-panel scratch-before-after-panel--after">
        <h3>{afterTitle}</h3>
        <div>{after}</div>
      </section>
    </div>
  );
}

export default BeforeAfter;
