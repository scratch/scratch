export default function ScratchBadge() {
  const base = globalThis.__SCRATCH_BASE__ || '';
  return (
    <a
      href="https://scratch.dev"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center text-gray-400 text-sm font-normal no-underline hover:no-underline"
    >
      <span className="text-sm">Made from</span>
      <img src={`${base}/scratch-logo.svg`} alt="Scratch" className="h-9 pb-0.5" />
    </a>
  );
}
