import React from 'react';
import { toneClass } from './utils';
import type { StepItem } from './types';

export function StepList({ steps }: { steps: StepItem[] }) {
  return (
    <ol className="not-prose scratch-step-list">
      {steps.map((step, index) => (
        <li key={index} className={toneClass(step.tone)}>
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

export default StepList;
