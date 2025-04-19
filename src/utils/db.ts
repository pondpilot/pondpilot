import {
  ColumnSortSpec,
  ColumnSortSpecList,
  DBTableOrViewSchema,
  NormalizedSQLType,
  SortOrder,
} from '@models/db';
import { assertNeverValueType } from './typing';
import { formatNumber } from './helpers';

export function isNumberType(type: NormalizedSQLType): boolean {
  switch (type) {
    case 'bigint':
    case 'number':
    case 'integer':
      return true;
    case 'date':
    case 'time':
    case 'timestamp':
    case 'boolean':
    case 'string':
    case 'bytes':
    case 'array':
    case 'object':
    case 'other':
      return false;
    default:
      assertNeverValueType(type);
      return false;
  }
}

export const stringifyTypedValue = ({
  type,
  value,
}: {
  type: NormalizedSQLType;
  value: unknown;
}): string => {
  try {
    switch (type) {
      case 'timestamp': {
        return new Date(value as string).toLocaleString();
      }
      case 'date': {
        return new Date(value as string).toLocaleDateString();
      }
      case 'time': {
        return new Date(value as string).toLocaleTimeString();
      }
      case 'string': {
        return value as string;
      }
      case 'bigint': {
        return (value as bigint).toString();
      }
      case 'boolean': {
        return `${value}` as string;
      }
      case 'bytes':
      case 'other':
      case 'array':
      case 'object': {
        return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
      }
      case 'integer':
      case 'number': {
        return formatNumber(value as number);
      }
      default:
        // eslint-disable-next-line no-case-declarations
        const _: never = type;
        console.error(`Unsupported value type in a table cell: ${type}`);
        return 'N/A';
    }
  } catch (error) {
    console.error('Error in dynamicTypeViewer', error);
    return "ERROR: Can't display value";
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
        oldColumn.name === newColumn.name &&
        oldColumn.databaseType === newColumn.databaseType &&
        oldColumn.nullable === newColumn.nullable &&
        oldColumn.sqlType === newColumn.sqlType
      );
    })
    .every((v) => v);
}
