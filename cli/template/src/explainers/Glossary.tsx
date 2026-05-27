import React from 'react';
import type { GlossaryItem } from './types';

export function Glossary({ items }: { items: GlossaryItem[] }) {
  return (
    <dl className="not-prose scratch-glossary">
      {items.map((item, index) => (
        <div key={index}>
          <dt>{item.term}</dt>
          <dd>{item.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

export default Glossary;
