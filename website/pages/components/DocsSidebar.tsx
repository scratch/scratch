import React, { useState, useEffect } from "react";

interface SubItem {
  id: string;
  text: string;
}

interface TocItem {
  id: string;
  text: string;
  children: SubItem[];
}

interface DocsSidebarProps {
  align?: "left" | "right";
}

export default function DocsSidebar({ align = "right" }: DocsSidebarProps) {
  const [sections, setSections] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    // Find all h2 and h3 elements on the page
    const headingElements = document.querySelectorAll("h2, h3");
    const items: TocItem[] = [];
    let currentSection: TocItem | null = null;

    headingElements.forEach((heading) => {
      // Generate id from text if not present
      if (!heading.id) {
        heading.id = heading.textContent
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "";
      }
      // Get text content, filtering out the # anchor
      let text = heading.textContent || "";
      text = text.replace(/^#\s*/, "").trim();

      if (heading.tagName === "H2") {
        currentSection = {
          id: heading.id,
          text,
          children: [],
        };
        items.push(currentSection);
      } else if (heading.tagName === "H3" && currentSection) {
        currentSection.children.push({
          id: heading.id,
          text,
        });
      }
    });

    setSections(items);

    // Scroll to hash after IDs are set
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => el.scrollIntoView(), 0);
      }
    }
  }, []);

  // Track which section is active based on scroll position
  useEffect(() => {
    const allIds: string[] = [];
    sections.forEach((section) => {
      allIds.push(section.id);
      section.children.forEach((child) => allIds.push(child.id));
    });

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

    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  // Update expanded section when activeId changes
  useEffect(() => {
    if (!activeId) return;

    // Find which section contains the active id
    for (const section of sections) {
      if (section.id === activeId || section.children.some(c => c.id === activeId)) {
        setExpandedSection(section.id);
        return;
      }
    }
  }, [activeId, sections]);

  const handleSectionClick = (sectionId: string) => {
    setExpandedSection(sectionId);
    setActiveId(sectionId);
  };

  const handleSubsectionClick = (sectionId: string, childId: string) => {
    setExpandedSection(sectionId);
    setActiveId(childId);
  };

  if (sections.length === 0) return null;

  const isLeft = align === "left";
  const positionStyle = isLeft
    ? { right: "calc(50% + 24rem)" }
    : { left: "calc(50% + 24rem)" };
  const textAlign = isLeft ? "text-right" : "text-left";
  const subIndent = isLeft ? "pr-3" : "pl-3";

  return (
    <nav className="hidden xl:block fixed top-48 w-48 text-sm" style={positionStyle}>
      <ul className="space-y-2">
        {sections.map((section) => {
          const isExpanded = expandedSection === section.id;
          const isSectionActive = activeId === section.id || section.children.some(c => c.id === activeId);

          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={() => handleSectionClick(section.id)}
                className={`block ${textAlign} transition-colors ${
                  isSectionActive
                    ? "text-gray-900 font-medium"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {section.text}
              </a>
              {section.children.length > 0 && (
                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <ul className={`overflow-hidden mt-1 space-y-1 ${subIndent}`}>
                    {section.children.map((child) => (
                      <li key={child.id}>
                        <a
                          href={`#${child.id}`}
                          onClick={() => handleSubsectionClick(section.id, child.id)}
                          className={`block ${textAlign} text-xs transition-colors ${
                            activeId === child.id
                              ? "text-gray-700 font-medium"
                              : "text-gray-400 hover:text-gray-500"
                          }`}
                        >
                          {child.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
