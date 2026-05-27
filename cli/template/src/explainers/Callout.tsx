import React from 'react';
import type { CalloutProps } from './types';

export function Callout({ tone = 'info', title, children }: CalloutProps) {
  return (
    <aside className={`not-prose scratch-callout scratch-callout--${tone}`}>
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}

export default Callout;
