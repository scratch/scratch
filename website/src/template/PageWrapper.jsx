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
    <div className="min-h-screen bg-white prose max-w-3xl mx-auto px-6 py-8">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
