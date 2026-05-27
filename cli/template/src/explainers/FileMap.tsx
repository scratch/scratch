import React from 'react';
import { Files } from 'lucide-react';
import { toneClass } from './utils';
import type { FileMapProps } from './types';

export function FileMap({ title = 'File map', files }: FileMapProps) {
  return (
    <section className="not-prose scratch-file-map">
      <h3 className="scratch-icon-heading">
        <Files aria-hidden="true" />
        {title}
      </h3>
      <dl>
        {files.map((file) => (
          <div key={file.path} className={toneClass(file.tone)}>
            <dt>
              <code>{file.path}</code>
            </dt>
            <dd>
              <strong>{file.role}</strong>
              {file.details ? <span>{file.details}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default FileMap;
