export default function ScratchBadge() {
  return (
    <a
      href="https://scratch.dev"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center text-black text-base font-normal no-underline hover:no-underline"
    >
      <span className="text-lg">Made from</span>
      <img src="/scratch-logo.svg" alt="Scratch" className="h-13 pb-1" />
    </a>
  );
}
