import { DataTable, DBColumn, DBTableOrViewSchema, NormalizedSQLType } from '@models/db';
import type { Field, RecordBatch, Table } from 'apache-arrow';
import { DataType } from 'apache-arrow';
import { getTableColumnId } from './table';

/**
 * Returns an Apache Arrow table as an array of row records.
 */
export function convertArrowTable(table: Table | RecordBatch): DataTable {
  return table.toArray().map((row) => row.toJSON());
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
    return 'integer';
  }
  if (DataType.isFloat(type) || DataType.isDecimal(type)) {
    return 'number';
  }
  if (DataType.isBinary(type) || DataType.isFixedSizeBinary(type)) {
    return 'bytes';
  }
  if (DataType.isUtf8(type)) {
    return 'string';
  }
  if (DataType.isBool(type)) {
    return 'boolean';
  }
  if (DataType.isDate(type) || DataType.isTime(type) || DataType.isTimestamp(type)) {
    return 'date';
  }
  if (DataType.isList(type) || DataType.isFixedSizeList(type)) {
    return 'array';
  }
  if (DataType.isStruct(type) || DataType.isUnion(type)) {
    return 'object'; // Changed from 'object' as it's not in JSValueType
  }
  if (DataType.isInterval(type) || DataType.isMap(type)) {
    return 'other';
  }
  return 'other';
}
