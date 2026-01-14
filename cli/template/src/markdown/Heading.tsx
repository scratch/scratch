import React from 'react';

interface HeadingProps {
  children?: React.ReactNode;
  level: 2 | 3;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (React.isValidElement(children) && children.props?.children) {
    return getTextContent(children.props.children);
  }
  return '';
}

export function Heading({ children, level }: HeadingProps) {
  const text = getTextContent(children);
  const id = slugify(text);
  const Tag = `h${level}` as const;

  return (
    <Tag id={id} className="group relative">
      <a
        href={`#${id}`}
        className="heading-anchor"
        aria-label={`Link to ${text}`}
      >
        #
      </a>
      {children}
    </Tag>
  );
}

export function H2(props: Omit<HeadingProps, 'level'>) {
  return <Heading {...props} level={2} />;
}

export function H3(props: Omit<HeadingProps, 'level'>) {
  return <Heading {...props} level={3} />;
}
