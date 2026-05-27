import React from 'react';
import DataTable from './DataTable';
import StatusBadge from './StatusBadge';
import { toneLabels } from './constants';
import type { RequirementMatrixProps } from './types';

export function RequirementMatrix({ rows }: RequirementMatrixProps) {
  return (
    <DataTable wide>
      <table>
        <thead>
          <tr>
            <th>Requirement</th>
            <th>Status</th>
            <th>Current Support</th>
            <th>Gap</th>
            <th>Evidence</th>
            <th>Next Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>{row.requirement}</td>
              <td>
                <StatusBadge tone={row.status || 'neutral'}>{toneLabels[row.status || 'neutral']}</StatusBadge>
              </td>
              <td>{row.support}</td>
              <td>{row.gap || 'None'}</td>
              <td>{row.evidence || 'Not recorded'}</td>
              <td>{row.next || 'None'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}

export default RequirementMatrix;
