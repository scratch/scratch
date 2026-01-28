import React from "react";

interface HighlightProps {
  children: React.ReactNode;
}

export default function Highlight({ children }: HighlightProps): React.ReactElement {
  return (
    <span className="bg-yellow-200 px-1 rounded">
      {children}
    </span>
  );
}
