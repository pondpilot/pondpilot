/**
 * Formats a numeric value into a string with localized separators
 * according to the British format (en-GB).
 *
 * @param {number | string} v - Number or string representing a number to format
 * @returns {string} Formatted number with maximum two decimal places or empty string if input is not a number
 *
 * @example
 * formatNumber(1000) // returns "1,000"
 * formatNumber("1234.5") // returns "1,234.5"
 * formatNumber("abc") // returns ""
 */
export const formatNumber = (v: number | string): string => {
  const value = Number(v);
  if (Number.isNaN(value)) return '';

  const formatter = new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 2,
  });

  return formatter.format(value);
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

export const replaceSpecialChars = (str: string): string =>
  str.trim().replace(/[^a-zA-Z0-9]/g, '_');

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
