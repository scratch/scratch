import React from 'react';
import { intentLabels } from './constants';
import type { ExplainerHeroProps } from './types';

export function ExplainerHero({
  intent,
  title,
  summary,
  eyebrow,
  children,
}: ExplainerHeroProps) {
  return (
    <section className={`not-prose scratch-layout-hero scratch-layout-hero--${intent}`}>
      <p className="scratch-layout-eyebrow">{eyebrow || intentLabels[intent]}</p>
      <h1>{title}</h1>
      <div className="scratch-layout-summary">{summary}</div>
      {children ? <div className="scratch-layout-hero-extra">{children}</div> : null}
    </section>
  );
}

export default ExplainerHero;
