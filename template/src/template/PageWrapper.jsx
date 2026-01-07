import React from 'react';
import Header from './Header';
import Footer from './Footer';
import WidthToggle, { useWidthMode } from './WidthToggle';

/**
 * A simple wrapper applied to every page in the demo project. Feel free to
 * replace this with your own layout – the scratch CLI will automatically detect
 * the component and wrap each MDX page with it during the build.
 */
export default function PageWrapper({ children }) {
  const { isWide, toggle } = useWidthMode();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div
        className={`prose w-full mx-auto py-8 flex-1 ${
          isWide ? 'max-w-none px-8' : 'max-w-2xl px-6'
        }`}
      >
        <Header />
        {children}
      </div>
      <Footer />
      <WidthToggle isWide={isWide} onToggle={toggle} />
    </div>
  );
}
