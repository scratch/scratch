import React, { useState, useEffect } from "react";

interface TocItem {
  id: string;
  text: string;
}

export default function DocsSidebar() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Find all h2 elements on the page
    const h2Elements = document.querySelectorAll("h2");
    const items: TocItem[] = [];

    h2Elements.forEach((h2) => {
      // Generate id from text if not present
      if (!h2.id) {
        h2.id = h2.textContent
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "";
      }
      // Get text content, filtering out the # anchor
      let text = h2.textContent || "";
      text = text.replace(/^#\s*/, "").trim();
      items.push({
        id: h2.id,
        text,
      });
    });

    setHeadings(items);

    // Scroll to hash after IDs are set
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => el.scrollIntoView(), 0);
      }
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0px -80% 0px" }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className="hidden xl:block fixed top-48 w-48 text-sm" style={{ right: "calc(50% + 24rem)" }}>
      <ul className="space-y-2">
        {headings.map(({ id, text }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={`block text-right transition-colors ${
                activeId === id
                  ? "text-gray-900 font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
