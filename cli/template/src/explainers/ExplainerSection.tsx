import React from 'react';
import { toneClass } from './utils';
import type { ExplainerSectionProps } from './types';

export function ExplainerSection({
  title,
  label,
  tone,
  variant = 'default',
  children,
}: ExplainerSectionProps) {
  return (
    <section className={`not-prose scratch-section scratch-section--${variant} ${toneClass(tone) || ''}`.trim()}>
      {label ? <p className="scratch-section-label">{label}</p> : null}
      {title ? <h3>{title}</h3> : null}
      <div>{children}</div>
    </section>
  );
}

export default ExplainerSection;
