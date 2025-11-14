/**
 * Formats a numeric value with locale-specific thousands separators.
 * @param {number | string | BigInt} v - The value to format
 * @returns {string} The formatted number string or an empty string if the input cannot be converted to a number
 */
export const formatNumber = (value: number | string | BigInt): string => {
  if (typeof value === 'string') {
    return value;
  }
  return value.toLocaleString();
};

/**
 * Helper to find a unique name. Takes a base name and appends a counter to it until a unique name is found.
 *
 * @param {string} name - The base name to check.
 * @param {function} checkIfExists - A function that checks if a name exists.
 * @returns {string} - A unique name.
 * @throws {Error} - Throws an error if too many files with the same name are found.
 */
export const findUniqueName = (name: string, checkIfExists: (name: string) => boolean): string => {
  if (!checkIfExists(name)) return name;

  let counter = 1;
  let uniqueName = `${name}_${counter}`;

  while (checkIfExists(uniqueName)) {
    uniqueName = `${name}_${counter}`;
    counter += 1;

    // Prevent infinite loop
    if (counter > 10000) {
      throw new Error('Too many items with the same name');
    }
  }

  return uniqueName;
};

/**
 * Gets all existing names from both comparisons and SQL scripts in the store.
 * This ensures name uniqueness across both types of items.
 *
 * @param {object} options - Configuration options
 * @param {Map} options.comparisons - Map of all comparisons
 * @param {Map} options.sqlScripts - Map of all SQL scripts
 * @param {string} [options.excludeId] - Optional ID to exclude (when renaming)
 * @returns {Set<string>} Set of all existing names
 */
export const getAllExistingNames = (options: {
  comparisons: Map<string, { id: string; name: string }>;
  sqlScripts: Map<string, { id: string; name: string }>;
  excludeId?: string;
}): Set<string> => {
  const { comparisons, sqlScripts, excludeId } = options;

  const comparisonNames = Array.from(comparisons.values())
    .filter((item) => item.id !== excludeId)
    .map((item) => item.name);

  const scriptNames = Array.from(sqlScripts.values())
    .filter((item) => item.id !== excludeId)
    .map((item) => item.name);

  return new Set([...comparisonNames, ...scriptNames]);
};

export function quote(s: string, options = { single: false }): string {
  // Replace each quote with two quotes and wrap result in quotes
  if (options.single) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Escapes a string for CSV/TSV where a custom delimiter is used.
 * If the string contains the delimiter, a tab, a newline, or quotes, it will be wrapped in quotes.
 * If the string contains quotes, they will be escaped by doubling them.
 *
 * @param {string} s - The string to escape.
 * @param {string} delimiter - The delimiter to check for (e.g., ',' or '\t').
 * @returns {string} The escaped string.
 */
export function escapeField(s: string, delimiter: string = ','): string {
  if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\t')) {
    return quote(s);
  }
  return s;
}
