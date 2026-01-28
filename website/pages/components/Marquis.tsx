import React from "react";

interface MarquisProps {
  children: React.ReactNode;
}

export default function Marquis({ children }: MarquisProps): React.ReactElement {
  return (
    <span className="inline-block overflow-hidden max-w-32">
      <span className="inline-block animate-marquis whitespace-nowrap">
        {children}
      </span>
      <style>{`
        @keyframes marquis {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquis {
          animation: marquis 4s linear infinite;
        }
      `}</style>
    </span>
  );
}
