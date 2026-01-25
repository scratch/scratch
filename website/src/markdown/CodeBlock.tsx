import React, { useState, useRef } from 'react';

interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function CodeBlock({ children, className, style, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    if (!preRef.current) return;

    const code = preRef.current.textContent || '';
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="copy-button"
        aria-label="Copy code"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre ref={preRef} className={className} style={style} {...props}>
        {children}
      </pre>
    </div>
  );
}
