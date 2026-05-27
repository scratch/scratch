import React from 'react';
import { Link2 } from 'lucide-react';
import { toneClass } from './utils';
import type { ArtifactLink } from './types';

export function ArtifactLinks({ links }: { links: ArtifactLink[] }) {
  return (
    <div className="not-prose scratch-artifact-links">
      {links.map((link, index) => {
        const content = (
          <>
            <strong>
              <Link2 aria-hidden="true" />
              {link.label}
            </strong>
            {link.detail ? <span>{link.detail}</span> : null}
          </>
        );

        return link.href ? (
          <a key={index} href={link.href} className={toneClass(link.tone)}>
            {content}
          </a>
        ) : (
          <div key={index} className={toneClass(link.tone)}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export default ArtifactLinks;
