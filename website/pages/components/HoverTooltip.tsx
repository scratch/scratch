import React from "react";

interface HoverTooltipProps {
  children: React.ReactNode;
}

export default function HoverTooltip({ children }: HoverTooltipProps): React.ReactElement {
  return (
    <span className="relative group cursor-help">
      <span className="border-b border-dotted border-gray-400">*</span>
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-sm bg-gray-800 text-white rounded whitespace-nowrap z-10">
        {children}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></span>
      </span>
    </span>
  );
}
