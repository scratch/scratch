import React from 'react';
import { toneClass } from './utils';
import type { FlowCardProps } from './types';

export function FlowCard({ label, title, detail, tone }: FlowCardProps) {
  return (
    <section className={`not-prose scratch-flow-card ${toneClass(tone) || ''}`.trim()}>
      {label ? <p>{label}</p> : null}
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </section>
  );
}

export default FlowCard;
