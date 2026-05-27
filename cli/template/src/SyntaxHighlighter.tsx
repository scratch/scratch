import React, { useEffect, useMemo, useState } from 'react';

type SyntaxHighlighterProps = {
  code?: string;
  children?: React.ReactNode;
  language?: string;
  title?: string;
  variant?: 'default' | 'explainer';
};

type ThemeMode = 'light' | 'dark';

function readCode(code: string | undefined, children: React.ReactNode): string {
  if (code) return code.replace(/\n+$/, '');
  if (typeof children === 'string') return children.replace(/\n+$/, '');
  if (Array.isArray(children)) {
    return children
      .map((child) => (typeof child === 'string' ? child : ''))
      .join('')
      .replace(/\n+$/, '');
  }
  return '';
}

function normalizeLanguage(language: string | undefined): string {
  const value = (language || 'text').toLowerCase();
  if (['js', 'mjs', 'cjs'].includes(value)) return 'javascript';
  if (value === 'ts') return 'typescript';
  if (['sh', 'zsh', 'shell'].includes(value)) return 'bash';
  if (value === 'yml') return 'yaml';
  if (value === 'rb') return 'ruby';
  if (value === 'py') return 'python';
  return value;
}

function activeTheme(): ThemeMode {
  if (typeof document !== 'undefined') {
    const value = document.documentElement.dataset.theme;
    if (value === 'dark' || value === 'light') return value;
  }

  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

export default function SyntaxHighlighter({
  code,
  children,
  language,
  title,
  variant = 'default',
}: SyntaxHighlighterProps) {
  const source = useMemo(() => readCode(code, children), [code, children]);
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [highlightedHtml, setHighlightedHtml] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTheme(activeTheme());

    const updateTheme = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: ThemeMode }>;
      setTheme(customEvent.detail?.theme || activeTheme());
    };

    window.addEventListener('scratch-theme-change', updateTheme);

    return () => {
      window.removeEventListener('scratch-theme-change', updateTheme);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki');
        const html = await codeToHtml(source, {
          lang: normalizedLanguage,
          theme: theme === 'dark' ? 'github-dark' : 'github-light',
        });

        if (!cancelled) setHighlightedHtml(html);
      } catch {
        if (!cancelled) setHighlightedHtml('');
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [source, normalizedLanguage, theme]);

  const copyCode = async () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    try {
      await navigator.clipboard?.writeText(source);
    } catch {
      // Browser automation and strict permissions can reject clipboard writes.
    }
  };

  return (
    <div className={`not-prose code-card code-card--${variant}`}>
      <div className="code-toolbar">
        <span className="code-language">{title || normalizedLanguage}</span>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="copy-button"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {highlightedHtml ? (
        <div className="code-highlight" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      ) : (
        <pre>
          <code className={`language-${normalizedLanguage}`}>{source}</code>
        </pre>
      )}
    </div>
  );
}
