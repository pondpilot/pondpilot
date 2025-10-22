/**
 * Environment variable access
 * Separated into its own module for testability
 */

export function getViteEnv() {
  return {
    VITE_CORS_PROXY_URL: import.meta.env.VITE_CORS_PROXY_URL as string | undefined,
    DEV: import.meta.env.DEV as boolean,
  };
}
