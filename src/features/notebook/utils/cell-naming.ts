import { NOTEBOOK_CELL_REF_PREFIX } from '@utils/notebook';

/**
 * Cell naming utilities for notebook temp views.
 *
 * Each SQL cell can provide:
 * 1) a stable machine reference (`cell.ref`)
 * 2) an optional user-defined alias (`cell.name`)
 *
 * For compatibility, `-- @name: my_view` on the first line is still parsed.
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

export function normalizeCellName(name?: string | null): string | null {
  const trimmed = name?.trim();
  return trimmed || null;
}

/**
 * Reserved prefixes that user-defined cell names cannot start with.
 * Prevents conflicts with auto-generated names.
 */
const RESERVED_PREFIXES = [NOTEBOOK_CELL_REF_PREFIX];

/**
 * Validates a user-defined cell name.
 * Returns an error message if invalid, null if valid.
 */
export function validateCellName(name: string, existingNames?: Set<string>): string | null {
  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    return `Invalid cell name "${name}": must be a valid SQL identifier (letters, digits, underscores, no leading digit)`;
  }

  const lowerName = name.toLowerCase();
  for (const prefix of RESERVED_PREFIXES) {
    if (lowerName.startsWith(prefix.toLowerCase())) {
      return `Cell name "${name}" cannot start with reserved prefix "${prefix}"`;
    }
  }

  if (existingNames?.has(name.toLowerCase())) {
    return `Cell name "${name}" is already used by another cell`;
  }

  return null;
}

/**
 * Extracts all cell view references from SQL using identifier token matching.
 * `availableNames` are matched case-insensitively and returned in canonical form.
 */
export function extractCellReferences(
  sql: string,
  availableNames: Set<string>,
): string[] {
  if (!sql.trim()) return [];

  const canonicalByLower = new Map<string, string>();
  for (const name of availableNames) {
    canonicalByLower.set(name.toLowerCase(), name);
  }

  const references: string[] = [];
  const seen = new Set<string>();
  const identifierPattern = /\b[a-zA-Z_]\w*\b/g;

  let match;
  while ((match = identifierPattern.exec(sql)) !== null) {
    const identifier = match[0];
    const canonicalName = canonicalByLower.get(identifier.toLowerCase());
    if (canonicalName) {
      if (seen.has(canonicalName)) continue;
      seen.add(canonicalName);
      references.push(canonicalName);
      continue;
    }

    if (identifier.toLowerCase().startsWith(NOTEBOOK_CELL_REF_PREFIX.toLowerCase())) {
      if (seen.has(identifier)) continue;
      seen.add(identifier);
      references.push(identifier);
    }
  }

  return references;
}
