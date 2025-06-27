import { useGlobalNavigation } from '@hooks/use-global-navigation';
import { ReactNode } from 'react';

interface GlobalNavigationHandlerProps {
  children: ReactNode;
}

/**
 * Component that sets up global navigation event handling for the entire app.
 * This should be used inside the Router context but outside of presentational components.
 */
export function GlobalNavigationHandler({ children }: GlobalNavigationHandlerProps) {
  useGlobalNavigation();

  return <>{children}</>;
}
