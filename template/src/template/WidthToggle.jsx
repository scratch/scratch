import { useState, useEffect } from 'react';

const STORAGE_KEY = 'scratch-width-mode';

/**
 * A minimal toggle switch for switching between narrow (2xl) and wide (full) page width.
 * Persists preference in localStorage.
 */
export default function WidthToggle({ isWide, onToggle }) {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Only show after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={onToggle}
      className={`fixed top-4 left-1/2 -translate-x-1/2 flex items-center rounded overflow-hidden shadow-sm border border-gray-200 transition-all duration-200 z-50 ${
        scrolled ? 'opacity-30 hover:opacity-100' : ''
      }`}
      aria-label={isWide ? 'Switch to narrow width' : 'Switch to wide width'}
      title={isWide ? 'Switch to narrow width' : 'Switch to wide width'}
    >
      {/* Narrow mode icon */}
      <div
        className={`w-6 h-5 flex items-center justify-center transition-colors ${
          !isWide ? 'bg-white' : 'bg-gray-100'
        }`}
      >
        <NarrowIcon active={!isWide} />
      </div>
      {/* Wide mode icon */}
      <div
        className={`w-6 h-5 flex items-center justify-center transition-colors ${
          isWide ? 'bg-white' : 'bg-gray-100'
        }`}
      >
        <WideIcon active={isWide} />
      </div>
    </button>
  );
}

/** Icon showing narrow layout: gray sides with white center column */
function NarrowIcon({ active }) {
  const borderColor = active ? '#9ca3af' : '#d1d5db';
  const centerColor = active ? '#ffffff' : '#f3f4f6';
  const sideColor = active ? '#e5e7eb' : '#f3f4f6';

  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke={borderColor} fill={sideColor} />
      <rect x="4" y="1" width="6" height="8" fill={centerColor} />
    </svg>
  );
}

/** Icon showing wide layout: all white/filled */
function WideIcon({ active }) {
  const borderColor = active ? '#9ca3af' : '#d1d5db';
  const fillColor = active ? '#ffffff' : '#f3f4f6';

  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke={borderColor} fill={fillColor} />
    </svg>
  );
}

/**
 * Hook to manage width mode state with localStorage persistence.
 */
export function useWidthMode() {
  const [isWide, setIsWide] = useState(false);

  // Load preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'wide') {
      setIsWide(true);
    }
  }, []);

  const toggle = () => {
    setIsWide((prev) => {
      const newValue = !prev;
      localStorage.setItem(STORAGE_KEY, newValue ? 'wide' : 'narrow');
      return newValue;
    });
  };

  return { isWide, toggle };
}
