import { useState, useEffect } from 'react';

const STORAGE_KEY = 'scratch-width-mode';

/**
 * A minimal toggle switch for switching between narrow (2xl), medium (4xl), and wide (full) page width.
 * Persists preference in localStorage.
 */
export default function WidthToggle({ widthMode, setWidthMode }) {
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
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 flex items-center rounded overflow-hidden shadow-sm border border-gray-200 transition-all duration-100 z-50 ${
        scrolled ? 'opacity-30 hover:opacity-100' : ''
      }`}
    >
      {/* Narrow mode button */}
      <button
        onClick={() => setWidthMode('narrow')}
        className={`w-6 h-5 flex items-center justify-center bg-white transition-opacity duration-100 ${
          widthMode === 'narrow' ? '' : 'opacity-50'
        }`}
        aria-label="Switch to narrow width"
        title="Narrow width (2xl)"
      >
        <NarrowIcon />
      </button>
      {/* Medium mode button */}
      <button
        onClick={() => setWidthMode('medium')}
        className={`w-6 h-5 flex items-center justify-center bg-white transition-opacity duration-100 ${
          widthMode === 'medium' ? '' : 'opacity-50'
        }`}
        aria-label="Switch to medium width"
        title="Medium width (4xl)"
      >
        <MediumIcon />
      </button>
      {/* Wide mode button */}
      <button
        onClick={() => setWidthMode('wide')}
        className={`w-6 h-5 flex items-center justify-center bg-white transition-opacity duration-100 ${
          widthMode === 'wide' ? '' : 'opacity-50'
        }`}
        aria-label="Switch to wide width"
        title="Wide width (full)"
      >
        <WideIcon />
      </button>
    </div>
  );
}

/** Icon showing narrow layout: gray sides with narrow white center column */
function NarrowIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="#9ca3af" fill="#e5e7eb" />
      <rect x="5" y="1" width="4" height="8" fill="#ffffff" />
    </svg>
  );
}

/** Icon showing medium layout: gray sides with wider white center column */
function MediumIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="#9ca3af" fill="#e5e7eb" />
      <rect x="4" y="1" width="6" height="8" fill="#ffffff" />
    </svg>
  );
}

/** Icon showing wide layout: all white/filled */
function WideIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
      <rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="#9ca3af" fill="#ffffff" />
    </svg>
  );
}

/**
 * Hook to manage width mode state with localStorage persistence.
 */
export function useWidthMode() {
  const [widthMode, setWidthModeState] = useState('narrow');

  // Load preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'narrow' || stored === 'medium' || stored === 'wide') {
      setWidthModeState(stored);
    }
  }, []);

  const setWidthMode = (mode) => {
    setWidthModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  return { widthMode, setWidthMode };
}
