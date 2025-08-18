import { useState, useEffect } from 'react';

interface UseActiveSectionOptions {
  sections: string[];
  threshold?: number;
  initialSection?: string;
}

export const useActiveSection = (options: UseActiveSectionOptions): string => {
  const { sections, threshold = 0.6, initialSection } = options;
  const [activeSection, setActiveSection] = useState(initialSection || sections[0] || '');

  useEffect(() => {
    const visibleSections = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        // Update visible sections map
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry.intersectionRatio);
          } else {
            visibleSections.delete(entry.target.id);
          }
        });

        // Find section with highest intersection ratio
        // Section must be visible at least at the given threshold to become active
        let maxRatio = 0;
        let mostVisibleSection = '';

        sections.forEach((sectionId) => {
          const ratio = visibleSections.get(sectionId);
          if (ratio !== undefined && ratio >= threshold && ratio >= maxRatio) {
            maxRatio = ratio;
            mostVisibleSection = sectionId;
          }
        });

        // If no section passes visibility threshold, keep current active
        if (!mostVisibleSection) {
          return; // don't update activeSection
        }

        // Update active section only if there's a visible section
        if (mostVisibleSection) {
          setActiveSection(mostVisibleSection);
        }
      },
      {
        rootMargin: '0px 0px 0px 0px', // Remove rootMargin to avoid dead zones
        threshold: Array.from({ length: 11 }, (_, i) => i * 0.1), // [0, 0.1, 0.2, ..., 1.0] for smooth tracking
      },
    );

    // Find and observe all sections
    sections.forEach((sectionId) => {
      const element = document.getElementById(sectionId);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [sections, threshold]);

  return activeSection;
};
