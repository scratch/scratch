import ScratchBadge from './ScratchBadge';
import Copyright from './Copyright';

export default function Footer() {
  return (
    <footer className="flex flex-col items-center gap-1 py-8">
      <ScratchBadge />
      <Copyright />
    </footer>
  );
}
