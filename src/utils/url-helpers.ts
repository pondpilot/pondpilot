/**
 * Checks if a URL is a remote URL (http/https/s3/gcs/azure/motherduck)
 */
export function isRemoteUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalizedUrl = url.trim().toLowerCase();
  return (
    normalizedUrl.startsWith('http://') ||
    normalizedUrl.startsWith('https://') ||
    normalizedUrl.startsWith('s3://') ||
    normalizedUrl.startsWith('gcs://') ||
    normalizedUrl.startsWith('azure://') ||
    normalizedUrl.startsWith('md:')
  );
}

/**
 * Checks if a URL is a MotherDuck URL
 */
export function isMotherDuckUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.trim().toLowerCase().startsWith('md:');
}

/**
 * Extracts the database name from a MotherDuck URL
 * @param url The MotherDuck URL (e.g., 'md:my_database')
 * @returns The database name or null if not a valid MotherDuck URL
 */
export function extractMotherDuckDbName(url: string | undefined): string | null {
  if (!url) return null;
  const trimmedUrl = url.trim();
  if (!isMotherDuckUrl(trimmedUrl)) {
    return null;
  }
  return trimmedUrl.slice(3); // Remove 'md:' prefix
}
