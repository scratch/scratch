import React from 'react';
import DataTable from './DataTable';
import { toneClass } from './utils';
import type { RiskItem } from './types';

type RiskRegisterProps = {
  risks?: RiskItem[];
  items?: RiskItem[];
};

export function RiskRegister({ risks, items }: RiskRegisterProps) {
  const rows = risks ?? items ?? [];

  return (
    <DataTable wide>
      <table>
        <thead>
          <tr>
            <th>Risk</th>
            <th>Impact</th>
            <th>Mitigation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((risk, index) => (
            <tr key={index} className={toneClass(risk.tone)}>
              <td>{risk.risk}</td>
              <td>{risk.impact || 'Not recorded'}</td>
              <td>{risk.mitigation || 'Not recorded'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}

export default RiskRegister;
