import React from 'react';
import type { DataTableProps } from './types';

export function DataTable({
  children,
  caption,
  density = 'normal',
  wide = false,
}: DataTableProps) {
  return (
    <div
      className={[
        'not-prose scratch-data-table',
        density === 'compact' ? 'scratch-data-table--compact' : '',
        wide ? 'scratch-data-table--wide' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {caption ? <div className="scratch-data-table-caption">{caption}</div> : null}
      <div className="scratch-data-table-scroll">{children}</div>
    </div>
  );
}

export default DataTable;
