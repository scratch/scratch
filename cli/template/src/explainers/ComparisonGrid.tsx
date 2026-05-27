import React from 'react';
import { toneClass } from './utils';
import type { ComparisonGridItem, ComparisonGridProps } from './types';

export function ComparisonGrid({ leftTitle, rightTitle, left, right }: ComparisonGridProps) {
  const renderSide = (title: React.ReactNode, items: ComparisonGridItem[]) => (
    <section>
      <h3>{title}</h3>
      <dl>
        {items.map((item, index) => (
          <div key={index} className={toneClass(item.tone)}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <div className="not-prose scratch-comparison-grid">
      {renderSide(leftTitle, left)}
      {renderSide(rightTitle, right)}
    </div>
  );
}

export default ComparisonGrid;
