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

export function quote(s: string, options = { single: false }): string {
  // Replace each quote with two quotes and wrap result in quotes
  if (options.single) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Escapes a string for CSV where commas are used as delimiters.
 * If the string contains a comma, it will be wrapped in quotes.
 * If the string contains quotes, they will be escaped by doubling them.
 *
 * @param {string} s - The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeCSVField(s: string): string {
  if (s.search(/"|,|\n/g) === -1) {
    return s;
  }
  return quote(s);
}
