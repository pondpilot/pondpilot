import { useEffect, useRef, useState } from 'react';

import { DBTableOrViewSchema } from '@models/db';

interface UseNoResultsPositionProps {
  hasRows: boolean;
  schema: DBTableOrViewSchema;
  horizontalPadding?: number;
}

export function useNoResultsPosition({ hasRows, schema }: UseNoResultsPositionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: '50%' });

  useEffect(() => {
    if (!hasRows && containerRef.current) {
      const updatePosition = () => {
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          const containerWidth = containerRect.width;
          const viewportWidth = window.innerWidth;
          const visibleWidth = Math.min(containerWidth, viewportWidth - 200);
          const leftPosition = `${visibleWidth / 2}px`;
          setPosition({ left: leftPosition });
        }
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      return () => window.removeEventListener('resize', updatePosition);
    }
  }, [hasRows, schema]);

  return { containerRef, position };
}
