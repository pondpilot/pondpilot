import type { DataType, Decimal, Field, RecordBatch, Table } from 'apache-arrow';
import { BN } from 'apache-arrow/util/bn';

/**
 * Returns the schema of an Apache Arrow table as an array of objects.
 */
export function getArrowTableSchema(table: Table | RecordBatch) {
  return table.schema.fields.map(getArrowFieldSchema);
}

export type JavaScriptArrowType =
  | 'integer'
  | 'number'
  | 'buffer'
  | 'string'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'other';

export type ResultColumn = {
  name: string;
  type: JavaScriptArrowType;
  nullable: boolean;
  databaseType: string;
};

/**
 * Returns the schema of an Apache Arrow field as an object.
 */
function getArrowFieldSchema(field: Field): ResultColumn {
  return {
    name: field.name,
    type: getArrowType(field.type),
    nullable: field.nullable,
    databaseType: String(field.type),
  };
}

// https://github.com/apache/arrow/blob/89f9a0948961f6e94f1ef5e4f310b707d22a3c11/js/src/enum.ts#L140-L141

/**
 * Returns the type of an Apache Arrow field as a string.
 */
export function getArrowType(type: DataType): JavaScriptArrowType {
  switch (type.typeId) {
    case 2: // Int
      return 'integer';
    case 3: // Float
    case 7: // Decimal
      return 'number';
    case 4: // Binary
    case 15: // FixedSizeBinary
      return 'buffer';
    case 5: // Utf8
      return 'string';
    case 6: // Bool
      return 'boolean';
    case 8: // Date
    case 9: // Time
    case 10: // Timestamp
      return 'date';
    case 12: // List
    case 16: // FixedSizeList
      return 'array';
    case 13: // Struct
    case 14: // Union
      return 'object';
    case 11: // Interval
    case 17: // Map
    default:
      return 'other';
  }
}

export type DataTable = {
  schema: ResultColumn[];
  data: any[];
  numRows: number;
};

function patchDecimal(value: any, type: Decimal): any {
  try {
    return new BN(value, true).valueOf(type.scale);
  } catch (error) {
    console.error(`Error patching decimal value <${value}> of the type <${typeof value}>:`, error);
    return value;
  }
}

const createDecimalPatcher = (type: Decimal) => (value: any) => patchDecimal(value, type);

export function getDataTableFromArrowTable(table: Table<any>, columnNames?: string[]): DataTable {
  if (columnNames && columnNames.length > 0) {
    table = table.select(columnNames);
  }

  const colnameToPatch: { [columnName: string]: (value: any) => any } = {};

  for (const column of table.schema.fields) {
    if (column.type.typeId === 7) {
      // Decimal
      colnameToPatch[column.name] = createDecimalPatcher(column.type as Decimal);
    }
  }

  const hasPatches = Object.keys(colnameToPatch).length > 0;

  return {
    schema: getArrowTableSchema(table),
    data: table.toArray().map((row) => {
      const jsonRow = row.toJSON();

      if (!hasPatches) {
        return jsonRow;
      }

      // Apply patch functions for columns that need patching
      for (const columnName in jsonRow) {
        if (columnName in colnameToPatch) {
          jsonRow[columnName] = colnameToPatch[columnName](jsonRow[columnName]);
        }
      }

      return jsonRow;
    }),
    numRows: table.numRows,
  };
}
