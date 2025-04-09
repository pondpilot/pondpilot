export const isVersionGreater = (version1: string, version2: string) => {
  // Validate inputs
  if (typeof version1 !== 'string' || typeof version2 !== 'string') {
    throw new Error('Version arguments must be strings');
  }

  // Version extraction regex pattern
  const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

  // Extract version numbers using regex
  const v1Matches = version1.match(VERSION_PATTERN);
  const v2Matches = version2.match(VERSION_PATTERN);

  if (!v1Matches || !v2Matches) {
    throw new Error('Invalid version format');
  }

  // Convert matched groups to numbers, filtering out undefined values
  const v1 = v1Matches.slice(1).filter(Boolean).map(Number);
  const v2 = v2Matches.slice(1).filter(Boolean).map(Number);

  // Ensure both arrays have the same length
  const maxLength = Math.max(v1.length, v2.length);
  while (v1.length < maxLength) v1.push(0);
  while (v2.length < maxLength) v2.push(0);

  // Compare each segment
  for (let i = 0; i < maxLength; i += 1) {
    if (v1[i] > v2[i]) return true;
    if (v1[i] < v2[i]) return false;
  }

  // If we get here, versions are equal
  return false;
};
