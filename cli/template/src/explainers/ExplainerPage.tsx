import React from 'react';
import { ArrowLeft } from 'lucide-react';
import ExplainerSidebar from './ExplainerSidebar';
import type { ExplainerPageProps } from './types';

export function ExplainerPage({ children, sidebar = true }: ExplainerPageProps) {
  return (
    <div className="not-prose explainer-shell">
      <a className="explainer-index-link" href="../">
        <ArrowLeft aria-hidden="true" />
        Explainers
      </a>
      <main className="prose explainer-main">{children}</main>
      {sidebar ? <ExplainerSidebar /> : null}
    </div>
  );
}

export default ExplainerPage;
