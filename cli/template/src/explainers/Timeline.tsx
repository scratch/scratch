import React from 'react';
import { toneClass } from './utils';
import type { TimelineItem } from './types';

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="not-prose scratch-timeline">
      {items.map((item, index) => (
        <li key={index} className={toneClass(item.tone)}>
          <span className="scratch-timeline-marker" />
          <div>
            {item.time ? <p className="scratch-timeline-time">{item.time}</p> : null}
            <strong>{item.title}</strong>
            {item.detail ? <p>{item.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default Timeline;
