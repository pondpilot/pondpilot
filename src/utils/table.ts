/**
 * Generates a unique column ID based on the column name and index.
 *
 * @param {string} name - The base name of the column.
 * @param {number} idx - The index of the column.
 * @returns {string} A unique column ID.
 */
export const getTableColumnId = (name: string, idx: number): string => {
  return `${name}_${idx}`;
};
