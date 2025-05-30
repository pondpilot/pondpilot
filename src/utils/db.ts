import {
  ColumnSortSpec,
  ColumnSortSpecList,
  DBColumnId,
  DBTableOrViewSchema,
  FormattedValue,
  MAX_CELL_DISPLAY_LENGTH,
  NormalizedSQLType,
  SortOrder,
} from '@models/db';

import { assertNeverValueType } from './typing';

export function isNumberType(type: NormalizedSQLType): boolean {
  switch (type) {
    case 'bigint':
    case 'float':
    case 'decimal':
    case 'integer':
      return true;
    case 'date':
    case 'time':
    case 'timetz':
    case 'timestamp':
    case 'timestamptz':
    case 'interval':
    case 'boolean':
    case 'string':
    case 'bytes':
    case 'bitstring':
    case 'array':
    case 'object':
    case 'other':
      return false;
    default:
      assertNeverValueType(type);
      return false;
  }
}

const returnRegularFormattedValue = (formattedValue: string): FormattedValue => ({
  type: 'regular',
  formattedValue,
});

const truncateForDisplay = (value: string): string => {
  if (value.length <= MAX_CELL_DISPLAY_LENGTH) {
    return value;
  }
  // Truncate and add ellipsis to indicate truncation
  return `${value.substring(0, MAX_CELL_DISPLAY_LENGTH)}...`;
};

export const stringifyTypedValue = ({
  type,
  value,
}: {
  type: NormalizedSQLType;
  value: unknown;
}): FormattedValue => {
  const fallback: FormattedValue = {
    type: 'error',
    formattedValue: `ERROR: can't convert column value <${value}> to declared type <${type}>`,
  };

  try {
    // Early check for null or undefined values
    if (value === null || value === undefined) {
      return { type: 'null', formattedValue: 'NULL' };
    }

    switch (type) {
      case 'timestamp': {
        if (typeof value === 'number' || value instanceof Date) {
          const date = typeof value === 'number' ? new Date(value) : value;

          // Get year, month, day in UTC
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');

          // Get time components in UTC
          const hours = String(date.getUTCHours()).padStart(2, '0');
          const minutes = String(date.getUTCMinutes()).padStart(2, '0');
          const seconds = String(date.getUTCSeconds()).padStart(2, '0');

          // Format: 2023-01-15 14:30:00
          let result = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

          // Add milliseconds only if they are not 0
          if (date.getUTCMilliseconds() > 0) {
            result += `.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
          }

          return returnRegularFormattedValue(result);
        }
        return fallback;
      }
      case 'timestamptz': {
        if (typeof value === 'number' || value instanceof Date) {
          const date = typeof value === 'number' ? new Date(value) : value;

          // Get year, month, day
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');

          // Get time components
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');

          // Get timezone offset in minutes and convert to hours:minutes format
          const tzOffset = date.getTimezoneOffset();
          const tzSign = tzOffset <= 0 ? '+' : '-';
          const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');

          // Format date part
          let result = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

          // Add milliseconds if present
          if (date.getMilliseconds() > 0) {
            result += `.${String(date.getMilliseconds()).padStart(3, '0')}`;
          }

          // Add timezone offset
          result += `${tzSign}${tzHours}`;

          return returnRegularFormattedValue(result);
        }
        return fallback;
      }
      case 'date': {
        if (typeof value === 'number' || value instanceof Date) {
          const date = typeof value === 'number' ? new Date(value) : value;
          return returnRegularFormattedValue(date.toISOString().split('T')[0]);
        }
        return fallback;
      }
      case 'time': {
        if (typeof value === 'number' || typeof value === 'bigint') {
          // Handle PostgreSQL time format (microseconds since midnight)
          const numValue = typeof value === 'bigint' ? Number(value) : value;
          if (numValue > 0 && numValue < 86400000000) {
            const totalSeconds = Math.floor(numValue / 1000000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            return returnRegularFormattedValue(
              `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
            );
          }
          // Handle JavaScript timestamp
          const date = new Date(numValue);
          return returnRegularFormattedValue(date.toISOString().split('T')[1].split('.')[0]);
        }
        if (value instanceof Date) {
          return returnRegularFormattedValue(value.toISOString().split('T')[1].split('.')[0]);
        }
        if (typeof value === 'string' && /^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(value)) {
          return returnRegularFormattedValue(value);
        }
        return fallback;
      }
      case 'timetz': {
        if (typeof value === 'number' || typeof value === 'bigint' || value instanceof Date) {
          const date =
            typeof value === 'number' || typeof value === 'bigint'
              ? new Date(Number(value))
              : value;
          return returnRegularFormattedValue(`${date.toISOString().split('T')[1]} UTC`);
        }
        if (typeof value === 'string') {
          return returnRegularFormattedValue(value);
        }
        return fallback;
      }
      case 'interval': {
        return { type: 'error', formattedValue: 'Interval display not supported yet' };
      }
      case 'string': {
        const stringValue = typeof value === 'string' ? value : String(value);
        return returnRegularFormattedValue(truncateForDisplay(stringValue));
      }
      case 'bigint': {
        if (typeof value === 'bigint') {
          return returnRegularFormattedValue(value.toLocaleString());
        }
        if (typeof value === 'number') {
          return returnRegularFormattedValue(BigInt(Math.round(value)).toLocaleString());
        }
        if (typeof value === 'string' && /^-?\d+$/.test(value)) {
          return returnRegularFormattedValue(value);
        }
        return fallback;
      }
      case 'boolean': {
        return typeof value === 'boolean' ? returnRegularFormattedValue(String(value)) : fallback;
      }
      case 'float':
      case 'decimal': {
        if (typeof value === 'number') {
          return returnRegularFormattedValue(value.toLocaleString());
        }
        if (typeof value === 'string' && !Number.isNaN(parseFloat(value))) {
          return returnRegularFormattedValue(value);
        }
        return fallback;
      }
      case 'integer': {
        if (typeof value === 'number') {
          return returnRegularFormattedValue(Math.round(value).toLocaleString());
        }
        if (typeof value === 'string' && /^-?\d+$/.test(value)) {
          return returnRegularFormattedValue(value);
        }
        if (typeof value === 'bigint') {
          return returnRegularFormattedValue(value.toLocaleString());
        }
        return fallback;
      }
      case 'bytes': {
        if (value instanceof Uint8Array || Array.isArray(value)) {
          const bytes = Array.from(value);
          // If UTF-8 decoding fails, use hex representation
          const hexRepr = `\\x${bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('\\x')}`;

          try {
            // Try to decode as UTF-8 string
            try {
              // Use TextDecoder if available (modern browsers/Node.js)
              if (typeof TextDecoder !== 'undefined') {
                const bytesArray = value instanceof Uint8Array ? value : new Uint8Array(bytes);
                const decoder = new TextDecoder('utf-8', { fatal: true });
                return returnRegularFormattedValue(truncateForDisplay(decoder.decode(bytesArray)));
              }

              return returnRegularFormattedValue(truncateForDisplay(hexRepr));
            } catch (decodeError) {
              return returnRegularFormattedValue(truncateForDisplay(hexRepr));
            }
          } catch (e) {
            return returnRegularFormattedValue(truncateForDisplay(JSON.stringify(value)));
          }
        }
        return fallback;
      }
      case 'bitstring': {
        // Display bits as a sequence of 0 and 1
        if (typeof value === 'string') {
          return returnRegularFormattedValue(truncateForDisplay(value));
        }
        if (value instanceof Uint8Array || Array.isArray(value)) {
          try {
            const bitString = Array.from(value)
              .map((byte) => byte.toString(2).padStart(8, '0'))
              .join(' ');
            return returnRegularFormattedValue(truncateForDisplay(bitString));
          } catch (e) {
            return returnRegularFormattedValue(truncateForDisplay(JSON.stringify(value)));
          }
        }
        return fallback;
      }
      case 'array':
      case 'object':
      case 'other': {
        const jsonString = JSON.stringify(value, (_, v) =>
          typeof v === 'bigint' ? v.toLocaleString() : v,
        );
        return returnRegularFormattedValue(truncateForDisplay(jsonString));
      }
      default:
        // eslint-disable-next-line no-case-declarations
        const _: never = type;
        return fallback;
    }
  } catch (error) {
    console.error('Error in stringifyTypedValue', error);
    return { type: 'error', formattedValue: "ERROR: Can't display value" };
  }
};

export function toggleSortOrder(current: SortOrder): SortOrder {
  switch (current) {
    case 'asc':
      return 'desc';
    case 'desc':
      return null;
    case null:
      return 'asc';
    default:
      assertNeverValueType(current);
      return null;
  }
}

export function toggleColumnSort(current: ColumnSortSpec): ColumnSortSpec {
  return {
    ...current,
    order: toggleSortOrder(current.order),
  };
}

/**
 * Toggles the sort order of the given column given an existing,
 * possibly multi-column sort spec.
 *
 * As the result of this operation, you will always get 0 or 1
 * sorted columns spec. All columns except `field` will be discarded,
 * and if the toggle returns the field to null, the sort spec will be empty.
 *
 * @param current The current sort spec
 * @param columnName The field to toggle
 * @return The new sort spec
 */
export function toggleMultiColumnSort(
  current: ColumnSortSpecList,
  columnName: string,
): ColumnSortSpecList {
  // If the column is already in the sort list, use it's order otherwise assume none.
  // Discard all other sorted columns
  const columnSortSpec = current.find((s) => s.column === columnName) || {
    column: columnName,
    order: null,
  };

  const toggled = toggleColumnSort(columnSortSpec);

  if (toggled.order === null) {
    return [];
  }

  return [toggled];
}

/**
 * Checks if the current sort spec is the same as the new one.
 * The order of the columns in the list does not matter.
 *
 * @param current The current sort spec
 * @param newSort The new sort spec
 * @return True if the two specs are the same, false otherwise
 */
export function isTheSameSortSpec(
  current: ColumnSortSpecList,
  newSort: ColumnSortSpecList,
): boolean {
  if (current.length !== newSort.length) {
    return false;
  }

  const curMap = new Map(current.map((s) => [s.column, s]));
  const newMap = new Map(newSort.map((s) => [s.column, s]));
  for (const [column, sort] of curMap.entries()) {
    const newSortSpec = newMap.get(column);

    // `null` sort is the same as missing sort for the given column, so
    // we need a complicated check here.
    if (
      // no sort for this column in new spect, but not null in current
      (!newSortSpec && sort !== null) ||
      // some sort for this column in new spec, but not the same as current
      (newSortSpec && sort.order !== newSortSpec.order)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if the current schema is the same as the new one.
 * The order of the columns matter!
 *
 * @param current The current schema
 * @param newSchema The new schema
 * @return True if the two schemas are the same, false otherwise
 */
export function isSameSchema(
  current: DBTableOrViewSchema,
  newSchema: DBTableOrViewSchema,
): boolean {
  if (current.length !== newSchema.length) {
    return false;
  }

  return current
    .map((oldColumn, index) => {
      const newColumn = newSchema[index];

      if (!newColumn) {
        return false;
      }

      return (
        oldColumn.id === newColumn.id &&
        oldColumn.columnIndex === newColumn.columnIndex &&
        oldColumn.name === newColumn.name &&
        oldColumn.databaseType === newColumn.databaseType &&
        oldColumn.nullable === newColumn.nullable &&
        oldColumn.sqlType === newColumn.sqlType
      );
    })
    .every((v) => v);
}

/**
 * Checks if the `subset` schema is a strict subset of the given `base` schema.
 * A strict subset means all columns in the subset exist in the `base`
 * with matching properties, but the `base` may have additional columns.
 *
 * @param base The schema that should contain all columns from the subset
 * @param subset The schema that should be a subset
 * @return True if subset is a strict subset of base, false otherwise
 */
export function isStrictSchemaSubset(
  base: DBTableOrViewSchema,
  subset: DBTableOrViewSchema,
): boolean {
  if (subset.length > base.length) {
    return false;
  }

  return subset
    .map((subsetColumn, index) => {
      const baseColumn = base[index];

      if (!baseColumn) {
        return false;
      }

      return (
        subsetColumn.id === baseColumn.id &&
        subsetColumn.columnIndex === baseColumn.columnIndex &&
        subsetColumn.name === baseColumn.name &&
        subsetColumn.databaseType === baseColumn.databaseType &&
        subsetColumn.nullable === baseColumn.nullable &&
        subsetColumn.sqlType === baseColumn.sqlType
      );
    })
    .every((v) => v);
}

/**
 * Generates a unique column ID based on the column name and index.
 *
 * @param {string} name - The base name of the column.
 * @param {number} idx - The index of the column in the data source.
 * @returns {string} A unique column ID.
 */
export const getTableColumnId = (name: string, idx: number): DBColumnId => {
  return `${idx}_${name}` as DBColumnId;
};
