/**
 * Route navigation utilities for PondPilot
 */

/**
 * Navigate to a route without page reload using custom event
 * @param route - The route to navigate to (e.g., '/settings')
 */
export function navigateToRoute(route: string): void {
  const event = new CustomEvent('navigate-to-route', { detail: { route } });
  window.dispatchEvent(event);
}

/**
 * Navigate to the settings page
 */
export function navigateToSettings(): void {
  navigateToRoute('/settings');
}
