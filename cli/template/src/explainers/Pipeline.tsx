import React from 'react';
import { toneClass } from './utils';
import type { PipelineProps } from './types';

export function Pipeline({ steps, direction = 'horizontal' }: PipelineProps) {
  return (
    <ol className={`not-prose scratch-pipeline scratch-pipeline--${direction}`}>
      {steps.map((step, index) => (
        <li key={`${step.title}-${index}`} className={toneClass(step.tone)}>
          <span>{index + 1}</span>
          <div>
            <strong>{step.title}</strong>
            {step.detail ? <p>{step.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default Pipeline;
