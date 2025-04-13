type NormalizedSQLType = 'number' | 'text' | 'boolean' | 'datetime' | 'date' | 'other';

/**
 * Converts a column type to a more generic SQL type for autocompletion
 */
export const getSQLType = (type: string): NormalizedSQLType => {
  const typeLower = type.toLowerCase();
  if (
    typeLower.includes('int') ||
    typeLower.includes('decimal') ||
    typeLower.includes('numeric') ||
    typeLower.includes('float') ||
    typeLower.includes('double')
  ) {
    return 'number';
  }
  if (typeLower.includes('char') || typeLower.includes('text') || typeLower.includes('string')) {
    return 'text';
  }
  if (typeLower.includes('datetime') || typeLower.includes('time')) {
    return 'datetime';
  }
  if (typeLower.includes('date')) {
    return 'date';
  }
  if (typeLower.includes('bool')) {
    return 'boolean';
  }
  return 'other';
};
