/**
 * Minimal page wrapper for watch mode and --minimal projects.
 * Simple prose styling without Header, Footer, or branding.
 */
export default function PageWrapper({ children }) {
  return (
    <div className="min-h-screen bg-white prose max-w-2xl mx-auto px-6 py-8">
      {children}
    </div>
  );
}
