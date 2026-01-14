import React from 'react';
import Header from './Header';
import Footer from './Footer';
import WidthToggle, { useWidthMode } from './WidthToggle';

/**
 * A simple wrapper applied to every page in the demo project. Feel free to
 * replace this with your own layout – the scratch CLI will automatically detect
 * the component and wrap each MDX page with it during the build.
 */
const widthClasses = {
  narrow: 'max-w-2xl px-6',
  medium: 'max-w-4xl px-6',
  wide: 'max-w-none px-16',
};

export default function PageWrapper({ children }) {
  const { widthMode, setWidthMode } = useWidthMode();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div
        className={`prose w-full mx-auto py-8 flex-1 ${widthClasses[widthMode]}`}
      >
        <Header />
        {children}
      </div>
      <Footer />
      <WidthToggle widthMode={widthMode} setWidthMode={setWidthMode} />
    </div>
  );
}
