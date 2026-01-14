/**
 * Common MDX/JSX errors and their user-friendly explanations
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  getMessage: (match: RegExpMatchArray, filePath?: string) => string;
}> = [
  {
    pattern:
      /The `style` prop expects a mapping from style properties to values, not a string/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  HTML-style "style" attributes don't work in MDX.\n\n` +
      `  Instead of:  <div style="color: red">\n` +
      `  Use:         <div style={{color: 'red'}}>\n\n` +
      `  MDX uses JSX syntax, so style must be an object.`,
  },
  {
    pattern: /Invalid DOM property `class`\. Did you mean `className`\?/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  HTML-style "class" attributes don't work in MDX.\n\n` +
      `  Instead of:  <div class="foo">\n` +
      `  Use:         <div className="foo">\n\n` +
      `  MDX uses JSX syntax, so use className instead of class.`,
  },
  {
    pattern:
      /Element type is invalid: expected a string.*but got: (undefined|object)/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  A JSX element couldn't be rendered. Common causes:\n\n` +
      `  1. Unclosed HTML tag - use self-closing syntax:\n` +
      `     Instead of:  <img src="...">\n` +
      `     Use:         <img src="..." />\n\n` +
      `  2. Missing component - check the component name is correct\n` +
      `     and the file exists in src/ or pages/`,
  },
  {
    pattern: /Expected corresponding JSX closing tag for <(\w+)>/,
    getMessage: (match, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  Unclosed <${match[1]}> tag.\n\n` +
      `  Either close it: <${match[1]}>...</${match[1]}>\n` +
      `  Or self-close:   <${match[1]} />`,
  },
  {
    pattern: /Unexpected token/,
    getMessage: (_, filePath) =>
      `MDX syntax error${filePath ? ` in ${filePath}` : ''}:\n` +
      `  Invalid JSX syntax. Check for:\n` +
      `  - Unclosed tags (use <img /> not <img>)\n` +
      `  - HTML attributes (use className not class)\n` +
      `  - Style attributes (use style={{}} not style="")`,
  },
];

/**
 * Attempt to extract the source file path from an error
 */
function extractFilePath(error: Error | string): string | undefined {
  const errorStr =
    error instanceof Error ? error.stack || error.message : error;
  // Look for paths in server-compiled or client-compiled directories
  const match = errorStr.match(
    /(?:server-compiled|client-compiled)\/([^/]+)\/index\.js/
  );
  if (match) {
    return `pages/${match[1]}.mdx`;
  }
  return undefined;
}

/**
 * Transform build errors into more helpful messages
 */
export function formatBuildError(error: Error | string): string {
  const errorStr = error instanceof Error ? error.message : error;
  const filePath = extractFilePath(error);

  for (const { pattern, getMessage } of ERROR_PATTERNS) {
    const match = errorStr.match(pattern);
    if (match) {
      return getMessage(match, filePath);
    }
  }

  // Return original error if no pattern matched
  return errorStr;
}
