import React from 'react';
import Header from './Header';
import Footer from './Footer';

/**
 * A simple wrapper applied to every page in the demo project. Feel free to
 * replace this with your own layout – the scratch CLI will automatically detect
 * the component and wrap each MDX page with it during the build.
 */
export default function PageWrapper({ children }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="prose w-full mx-auto py-8 flex-1 max-w-4xl px-6">
        <Header />
        {children}
      </div>
      <Footer />
    </div>
  );
}
