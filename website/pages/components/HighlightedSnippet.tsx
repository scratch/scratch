import React from "react";

interface HighlightedSnippetProps {
  children: React.ReactNode;
}

export default function HighlightedSnippet({ children }: HighlightedSnippetProps): React.ReactElement {
  return (
    <div className="my-6 px-6 py-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
      <div className="text-gray-700 italic">
        {children}
      </div>
    </div>
  );
}
