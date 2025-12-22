import React, { useState } from 'react';

export default function Counter(): React.ReactElement {
  const [count, setCount] = useState<number>(0);

  return (
    <div className="flex justify-center items-center gap-3 py-2">
      <button
        onClick={() => setCount((c) => c - 1)}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 hover:border-gray-400 text-gray-600 transition-colors"
      >
        -
      </button>
      <span className="text-xl font-medium text-gray-900 w-8 text-center tabular-nums">
        {count}
      </span>
      <button
        onClick={() => setCount((c) => c + 1)}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 hover:border-gray-400 text-gray-600 transition-colors"
      >
        +
      </button>
    </div>
  );
}
