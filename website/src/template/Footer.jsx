import ScratchBadge from './ScratchBadge';
import Copyright from './Copyright';

export default function Footer() {
  return (
    <footer className="not-prose text-center mt-16 pb-8">
      <ScratchBadge />
      <Copyright />
    </footer>
  );
}
