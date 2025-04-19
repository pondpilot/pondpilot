import { NormalizedSQLType } from '@models/db';

/**
 * Converts a DuckDB type to a normalized SQL type used in our application.
 */
export const normalizeDuckDBColumnType = (type: string): NormalizedSQLType => {
  const typeLower = type.toLowerCase();
  switch (typeLower) {
    case 'bigint':
    case 'int8':
    case 'long':
      return 'bigint';

    case 'double':
    case 'float8':
    case 'numeric':
    case 'decimal':
    case 'decimal(s, p)':
    case 'real':
    case 'float4':
    case 'float':
    case 'float32':
    case 'float64':
      return 'number';

    case 'hugeint':
    case 'integer':
    case 'smallint':
    case 'tinyint':
    case 'ubigint':
    case 'int':
    case 'signed':
    case 'int2':
    case 'short':
    case 'int1':
    case 'int64':
    case 'int32':
      return 'integer';

    case 'boolean':
    case 'bool':
    case 'logical':
      return 'boolean';

    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'interval':
      return 'number'; // date or time delta
    case 'timestamp':
    case 'timestamp with time zone':
    case 'datetime':
    case 'timestamptz':
      return 'timestamp';

    case 'uuid':
    case 'varchar':
    case 'char':
    case 'bpchar':
    case 'text':
    case 'string':
    case 'utf8': // this type is unlisted in the `types`, but is returned by the db as `column_type`...
      return 'string';
    default:
      return 'other';
  }
};
