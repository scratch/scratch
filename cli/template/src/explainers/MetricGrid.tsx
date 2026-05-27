import React from 'react';
import { toneClass } from './utils';
import type { MetricGridProps } from './types';

export function MetricGrid({ metrics }: MetricGridProps) {
  return (
    <div className="not-prose scratch-metric-grid">
      {metrics.map((metric) => (
        <section key={metric.label} className={toneClass(metric.tone)}>
          <p>{metric.label}</p>
          <strong>{metric.value}</strong>
          {metric.detail ? <span>{metric.detail}</span> : null}
        </section>
      ))}
    </div>
  );
}

export default MetricGrid;
