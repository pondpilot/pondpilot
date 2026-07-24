/**
 * Resolve a public asset URL against Vite's deployment base path.
 *
 * A leading slash in an environment variable is treated as public-root syntax,
 * not as an instruction to discard a configured subdirectory base.
 */
export function resolvePublicAssetUrl(
  rawUrl: string,
  baseUrl: string,
  locationOrigin: string,
): string {
  if (!rawUrl) return '';

  const absoluteBaseUrl = new URL(baseUrl, locationOrigin);
  return new URL(rawUrl.replace(/^\/+/, ''), absoluteBaseUrl).toString();
}
