import { NormalizedSQLType } from '@models/db';

/**
 * Converts a DuckDB type to a normalized SQL type used in our application.
 */
export const normalizeDuckDBColumnType = (type: string): NormalizedSQLType => {
  const typeLower = type.toLowerCase().trim();
  switch (typeLower) {
    case 'bigint':
    case 'int64':
    case 'int8':
    case 'long':
    case 'oid':
      return 'bigint';

    case 'binary':
    case 'blob':
    case 'bytea':
    case 'varbinary':
      return 'bytes';

    case 'bit':
    case 'bitstring':
      return 'bitstring';

    case 'bool':
    case 'boolean':
    case 'logical':
      return 'boolean';

    case 'bpchar':
    case 'char':
    case 'nvarchar':
    case 'string':
    case 'text':
    case 'varchar':
    case 'utf8': // this type is unlisted in the `types`, but is returned by the db as `column_type`...
      // return 'varchar'; - duckdb calls this group `varchar`
      // but we use `string` in our app
      return 'string';

    case 'date':
      return 'date';

    case 'datetime':
    case 'timestamp':
    case 'timestamp_us':
      return 'timestamp';

    case 'dec':
    case 'decimal':
    case 'numeric':
      return 'decimal';

    case 'double':
    case 'float8':
      return 'float'; // duckdb calls this `double`, but we collapse it to `float` in our app

    case 'enum':
      return 'string'; // TODO explicit support for enum types

    case 'float':
    case 'float4':
    case 'real':
      return 'float';

    case 'guid':
    case 'uuid':
      return 'string'; // we simply this to `string` in our app

    case 'hugeint':
    case 'int128':
      return 'bigint'; // duckdb native group 'hugeint'

    case 'int':
    case 'int32':
    case 'int4':
    case 'integer':
    case 'integral':
    case 'signed':
      return 'integer';

    case 'int1':
    case 'tinyint':
      return 'integer'; // duckdb native group 'tinyint'

    case 'int16':
    case 'int2':
    case 'short':
    case 'smallint':
      return 'integer'; // duckdb native group 'smallint';

    case 'interval':
      return 'interval';

    case 'list':
      return 'array'; // duckdb native group 'list';

    case 'map':
      return 'object'; // duckdb native group 'map';

    case 'null':
      return 'other'; // duckdb native group 'null';

    case 'row':
    case 'struct':
      return 'object'; // duckdb native group 'struct';

    case 'time':
      return 'time';

    case 'timestamptz':
      return 'timestamptz';

    case 'timestamp_ms':
      return 'other'; // TODO: support for timestamp_ms

    case 'timestamp_ns':
      return 'other'; // TODO: support for timestamp_ms

    case 'timestamp_s':
      return 'other'; // TODO: support for timestamp_ms

    case 'timetz':
      return 'timetz';

    case 'ubigint':
    case 'uint64':
      return 'bigint'; // duckdb native group 'ubigint';

    case 'uhugeint':
    case 'uint128':
      return 'bigint'; // duckdb native group 'uhugeint';

    case 'uint16':
    case 'usmallint':
      return 'integer'; // duckdb native group 'usmallint';

    case 'uint32':
    case 'uinteger':
      return 'integer'; // duckdb native group 'uinteger';

    case 'uint8':
    case 'utinyint':
      return 'integer'; // duckdb native group 'utinyint';

    case 'union':
      return 'other'; // TODO: support for 'union';

    case 'varint':
      return 'integer'; // duckdb native group 'varint';

    default:
      return 'other';
  }
};
