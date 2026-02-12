/**
 * Cell naming utilities for notebook temp views.
 *
 * Each executed SQL cell's result can be referenced by downstream cells via:
 * 1. Auto-generated names: `__cell_N` where N is the 1-based cell position
 * 2. User-defined names: parsed from `-- @name: my_view` comment on the first line
 *
 * Names are used to create DuckDB temp views after cell execution.
 */

/**
 * Pattern to match user-defined cell names in the first line of SQL content.
 * Supports: `-- @name: my_view` or `-- @name my_view`
 * Name must be a valid SQL identifier (alphanumeric + underscore, no leading digit).
 */
const CELL_NAME_PATTERN = /^--\s*@name[:\s]\s*([a-zA-Z_]\w*)\s*$/;

/**
 * Parse a user-defined cell name from the first line of SQL content.
 * Returns null if no valid name annotation is found.
 */
export function parseUserCellName(sqlContent: string): string | null {
  const firstLine = sqlContent.split('\n')[0]?.trim();
  if (!firstLine) return null;

  const match = firstLine.match(CELL_NAME_PATTERN);
  return match ? match[1] : null;
}

/**
 * Generate the automatic cell view name based on 1-based position.
 * Example: cell at position 0 (first) → `__cell_1`
 */
export function getAutoCellViewName(cellIndex: number): string {
  return `__cell_${cellIndex + 1}`;
}

/**
 * Reserved prefixes that user-defined cell names cannot start with.
 * Prevents conflicts with auto-generated names.
 */
const RESERVED_PREFIXES = ['__cell_'];

/**
 * Validates a user-defined cell name.
 * Returns an error message if invalid, null if valid.
 */
export function validateCellName(name: string): string | null {
  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    return `Invalid cell name "${name}": must be a valid SQL identifier (letters, digits, underscores, no leading digit)`;
  }

  for (const prefix of RESERVED_PREFIXES) {
    if (name.startsWith(prefix)) {
      return `Cell name "${name}" cannot start with reserved prefix "${prefix}"`;
    }
  }

  return null;
}

/**
 * Extracts all cell view references (both __cell_N and user-defined names)
 * from a SQL string. Used for dependency tracking.
 */
export function extractCellReferences(
  sql: string,
  availableNames: Set<string>,
): string[] {
  const references: string[] = [];

  // Match __cell_N patterns that correspond to actual cells
  const autoCellPattern = /__cell_\d+/g;
  let match;
  while ((match = autoCellPattern.exec(sql)) !== null) {
    if (availableNames.has(match[0]) && !references.includes(match[0])) {
      references.push(match[0]);
    }
  }

  // Match user-defined names that appear as identifiers in the SQL
  for (const name of availableNames) {
    // Skip auto-generated names (already handled above)
    if (name.startsWith('__cell_')) continue;

    // Use word boundary matching to avoid false positives
    const namePattern = new RegExp(`\\b${name}\\b`, 'g');
    if (namePattern.test(sql)) {
      if (!references.includes(name)) {
        references.push(name);
      }
    }
  }

  return references;
}
