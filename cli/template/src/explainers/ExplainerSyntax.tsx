import React from 'react';
import BaseSyntaxHighlighter from '../SyntaxHighlighter';

type SyntaxHighlighterProps = React.ComponentProps<typeof BaseSyntaxHighlighter>;

export default function ExplainerSyntax(props: SyntaxHighlighterProps) {
  return <BaseSyntaxHighlighter {...props} variant="explainer" />;
}
