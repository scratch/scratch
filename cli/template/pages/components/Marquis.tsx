import React from "react";

interface MarquisProps {
  children: React.ReactNode;
}

export default function Marquis({ children }: MarquisProps): React.ReactElement {
  return (
    <span className="inline-flex overflow-hidden max-w-32 align-baseline items-end">
      <span className="inline-flex animate-marquis whitespace-nowrap leading-none">
        <span>{children}</span>
        <span className="mx-4">{children}</span>
      </span>
    </span>
  );
}
