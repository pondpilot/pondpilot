import type { Field, RecordBatch, Table, Vector } from 'apache-arrow';
import { DataType } from 'apache-arrow';

import {
  DataTable,
  DBColumn,
  DBColumnId,
  DBTableOrViewSchema,
  NormalizedSQLType,
} from '@models/db';

import { getTableColumnId } from './db';

/**
 * Returns an Apache Arrow table as an array of row records.
 */
export function convertArrowTable(
  table: Table | RecordBatch,
  schema: DBTableOrViewSchema,
): DataTable {
  const columnVectorsAndIds = Array(table.numCols)
    .fill(null)
    .map((_, colIndex): [DBColumnId, Vector<any> | null] => [
      schema[colIndex].id,
      table.getChildAt(colIndex),
    ]);

  return Array(table.numRows)
    .fill(null)
    .map((_, rowIndex) =>
      Object.fromEntries(
        columnVectorsAndIds.map(([colId, colVector]) => [colId, colVector?.get(rowIndex)]),
      ),
    );
}

/**
 * Returns the schema of an Apache Arrow table as an array of objects.
 */
export function getArrowTableSchema(table: Table | RecordBatch): DBTableOrViewSchema {
  return table.schema.fields.map((field: Field<DataType>, columnIndex): DBColumn => {
    return {
      name: field.name,
      sqlType: getNormalizedSQLTypeFromArrowType(field.type),
      nullable: field.nullable,
      databaseType: String(field.type),
      id: getTableColumnId(field.name, columnIndex),
      columnIndex,
    };
  });
}

// https://github.com/apache/arrow/blob/89f9a0948961f6e94f1ef5e4f310b707d22a3c11/js/src/enum.ts#L140-L141

/**
 * Returns the type of an Apache Arrow field as a string.
 */
export function getNormalizedSQLTypeFromArrowType(type: DataType): NormalizedSQLType {
  if (DataType.isInt(type)) {
    // Check for bigint (Int64)
    if (type.bitWidth === 64) {
      return 'bigint';
    }
    return 'integer';
  }
  if (DataType.isFloat(type)) {
    return 'float';
  }
  if (DataType.isDecimal(type)) {
    return 'decimal';
  }

  // Bit strings are not directly defined in Arrow types
  // They will return as Binary, so any handling of bit strings
  // should be done by the data view layer in instances where the
  // precise type is known from metadata.
  if (DataType.isBinary(type) || DataType.isFixedSizeBinary(type)) {
    return 'bytes';
  }
  if (DataType.isUtf8(type)) {
    return 'string';
  }
  if (DataType.isBool(type)) {
    return 'boolean';
  }
  if (DataType.isDate(type)) {
    return 'date';
  }
  if (DataType.isTime(type)) {
    return 'time';
  }
  if (DataType.isTimestamp(type)) {
    // Check if it's timestamptz by looking at the timezone property
    const hasTimezone = type.timezone && type.timezone.length > 0;
    return hasTimezone ? 'timestamptz' : 'timestamp';
  }
  if (DataType.isInterval(type)) {
    return 'interval';
  }
  if (DataType.isList(type) || DataType.isFixedSizeList(type)) {
    return 'array';
  }
  if (DataType.isStruct(type) || DataType.isMap(type)) {
    return 'object';
  }
  if (DataType.isUnion(type)) {
    return 'other';
  }
  if (DataType.isDictionary(type)) {
    // For dictionary encoded data, we use the value type
    return getNormalizedSQLTypeFromArrowType(type.valueType);
  }

  return 'other';
}
