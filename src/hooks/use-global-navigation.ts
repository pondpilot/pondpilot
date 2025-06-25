import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Hook that listens for global navigation events and handles programmatic navigation.
 * This centralizes navigation event handling outside of presentational components.
 */
export function useGlobalNavigation(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const handleNavigateEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ route: string }>;
      if (customEvent.detail?.route) {
        navigate(customEvent.detail.route);
      }
    };

    window.addEventListener('navigate-to-route', handleNavigateEvent);

    return () => {
      window.removeEventListener('navigate-to-route', handleNavigateEvent);
    };
  }, [navigate]);
}
