import React, { useEffect, useState } from 'react';

type HeadingLink = {
  id: string;
  text: string;
  level: number;
};

function readHeadings(): HeadingLink[] {
  return Array.from(document.querySelectorAll('main h2[id], main h3[id]'))
    .map((heading) => ({
      id: heading.id,
      text: heading.textContent?.replace(/^#/, '').trim() || heading.id,
      level: Number(heading.tagName.replace('H', '')),
    }))
    .filter((heading) => heading.id && heading.text);
}

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function scrollToHeading(id: string) {
  const target = document.getElementById(id);
  if (!target) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.scrollIntoView();
    return;
  }

  const startY = window.scrollY;
  const targetY = target.getBoundingClientRect().top + window.scrollY - 32;
  const distance = targetY - startY;
  const duration = 900;
  const startTime = performance.now();

  function step(now: number) {
    const progress = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));

    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  }

  window.requestAnimationFrame(step);
}

export default function ExplainerSidebar() {
  const [headings, setHeadings] = useState<HeadingLink[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const nextHeadings = readHeadings();
    setHeadings(nextHeadings);
    if (!nextHeadings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visible?.target.id) {
          setActiveId(visible.target.id);
        }
      },
      {
        rootMargin: '-96px 0px -65% 0px',
        threshold: [0, 1],
      },
    );

    nextHeadings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  if (!headings.length) return null;

  return (
    <aside className="not-prose explainer-sidebar" aria-label="Explainer sections">
      <div className="explainer-sidebar-label">Sections</div>
      <nav className="explainer-sidebar-links">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            onClick={(event) => {
              event.preventDefault();
              setActiveId(heading.id);
              window.history.pushState(null, '', `#${heading.id}`);
              scrollToHeading(heading.id);
            }}
            className={[
              'explainer-sidebar-link',
              `depth-${heading.level}`,
              activeId === heading.id ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </aside>
  );
}
