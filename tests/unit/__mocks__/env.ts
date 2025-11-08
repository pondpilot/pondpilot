/**
 * Mock for src/utils/env.ts
 * Used in Jest tests to avoid import.meta parsing errors
 */

export function getViteEnv() {
  // Access the mock set up in jest-setup.js
  if ((globalThis as any).import?.meta?.env) {
    const { env } = (globalThis as any).import.meta;
    return {
      VITE_CORS_PROXY_URL: env.VITE_CORS_PROXY_URL as string | undefined,
      DEV: env.DEV as boolean,
    };
  }

  // Fallback for tests
  return {
    VITE_CORS_PROXY_URL: undefined,
    DEV: false,
  };
}
