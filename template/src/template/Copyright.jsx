export default function Copyright({ name }) {
  const author = name || (typeof window !== 'undefined' && window.__scratch_author__);
  const year = new Date().getFullYear();

  if (!author) {
    return null;
  }

  return (
    <p className="text-gray-400 text-sm">
      © {year} {author}
    </p>
  );
}
