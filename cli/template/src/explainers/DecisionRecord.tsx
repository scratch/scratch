import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { toneClass } from './utils';
import type { DecisionRecordProps } from './types';

export function DecisionRecord({
  title,
  decision,
  context,
  consequences = [],
  tone = 'info',
}: DecisionRecordProps) {
  return (
    <section className={`not-prose scratch-decision-record ${toneClass(tone) || ''}`}>
      <p className="scratch-section-label scratch-icon-label">
        <BadgeCheck aria-hidden="true" />
        Decision
      </p>
      <h3>{title}</h3>
      <div className="scratch-decision-body">
        <strong>{decision}</strong>
        {context ? <p>{context}</p> : null}
      </div>
      {consequences.length ? (
        <ul>
          {consequences.map((consequence, index) => (
            <li key={index}>{consequence}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default DecisionRecord;
