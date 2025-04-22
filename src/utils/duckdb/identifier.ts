// Run `duckdb -noheader -json -c "SELECT LISTAGG('''' || keyword_name || '''', ', ') AS keywords FROM duckdb_keywords();"` to get uptodate keywords
// prettier-ignore
const DUCKDB_RESERVED_KEYWORDS = new Set([
  'abort', 'absolute', 'access', 'action', 'add', 'admin', 'after', 'aggregate', 'all', 'also', 'alter', 'always', 'analyse', 'analyze', 'and', 'anti', 'any', 'array', 'as', 'asc', 'asof', 'assertion', 'assignment', 'asymmetric', 'at', 'attach', 'attribute', 'authorization', 'backward', 'before', 'begin', 'between', 'bigint', 'binary', 'bit', 'boolean', 'both', 'by', 'cache', 'call', 'called', 'cascade', 'cascaded', 'case', 'cast', 'catalog', 'centuries', 'century', 'chain', 'char', 'character', 'characteristics', 'check', 'checkpoint', 'class', 'close', 'cluster', 'coalesce', 'collate', 'collation', 'column', 'columns', 'comment', 'comments', 'commit', 'committed', 'compression', 'concurrently', 'configuration', 'conflict', 'connection', 'constraint', 'constraints', 'content', 'continue', 'conversion', 'copy', 'cost', 'create', 'cross', 'csv', 'cube', 'current', 'cursor', 'cycle', 'data', 'database', 'day', 'days', 'deallocate', 'dec', 'decade', 'decades', 'decimal', 'declare', 'default', 'defaults', 'deferrable', 'deferred', 'definer', 'delete', 'delimiter', 'delimiters', 'depends', 'desc', 'describe', 'detach', 'dictionary', 'disable', 'discard', 'distinct', 'do', 'document', 'domain', 'double', 'drop', 'each', 'else', 'enable', 'encoding', 'encrypted', 'end', 'enum', 'escape', 'event', 'except', 'exclude', 'excluding', 'exclusive', 'execute', 'exists', 'explain', 'export', 'export_state', 'extension', 'extensions', 'external', 'extract', 'false', 'family', 'fetch', 'filter', 'first', 'float', 'following', 'for', 'force', 'foreign', 'forward', 'freeze', 'from', 'full', 'function', 'functions', 'generated', 'glob', 'global', 'grant', 'granted', 'group', 'grouping', 'grouping_id', 'groups', 'handler', 'having', 'header', 'hold', 'hour', 'hours', 'identity', 'if', 'ignore', 'ilike', 'immediate', 'immutable', 'implicit', 'import', 'in', 'include', 'including', 'increment', 'index', 'indexes', 'inherit', 'inherits', 'initially', 'inline', 'inner', 'inout', 'input', 'insensitive', 'insert', 'install', 'instead', 'int', 'integer', 'intersect', 'interval', 'into', 'invoker', 'is', 'isnull', 'isolation', 'join', 'json', 'key', 'label', 'language', 'large', 'last', 'lateral', 'leading', 'leakproof', 'left', 'level', 'like', 'limit', 'listen', 'load', 'local', 'location', 'lock', 'locked', 'logged', 'macro', 'map', 'mapping', 'match', 'materialized', 'maxvalue', 'method', 'microsecond', 'microseconds', 'millennia', 'millennium', 'millisecond', 'milliseconds', 'minute', 'minutes', 'minvalue', 'mode', 'month', 'months', 'move', 'name', 'names', 'national', 'natural', 'nchar', 'new', 'next', 'no', 'none', 'not', 'nothing', 'notify', 'notnull', 'nowait', 'null', 'nullif', 'nulls', 'numeric', 'object', 'of', 'off', 'offset', 'oids', 'old', 'on', 'only', 'operator', 'option', 'options', 'or', 'order', 'ordinality', 'others', 'out', 'outer', 'over', 'overlaps', 'overlay', 'overriding', 'owned', 'owner', 'parallel', 'parser', 'partial', 'partition', 'passing', 'password', 'percent', 'persistent', 'pivot', 'pivot_longer', 'pivot_wider', 'placing', 'plans', 'policy', 'position', 'positional', 'pragma', 'preceding', 'precision', 'prepare', 'prepared', 'preserve', 'primary', 'prior', 'privileges', 'procedural', 'procedure', 'program', 'publication', 'qualify', 'quarter', 'quarters', 'quote', 'range', 'read', 'real', 'reassign', 'recheck', 'recursive', 'ref', 'references', 'referencing', 'refresh', 'reindex', 'relative', 'release', 'rename', 'repeatable', 'replace', 'replica', 'reset', 'respect', 'restart', 'restrict', 'returning', 'returns', 'revoke', 'right', 'role', 'rollback', 'rollup', 'row', 'rows', 'rule', 'sample', 'savepoint', 'schema', 'schemas', 'scope', 'scroll', 'search', 'second', 'seconds', 'secret', 'security', 'select', 'semi', 'sequence', 'sequences', 'serializable', 'server', 'session', 'set', 'setof', 'sets', 'share', 'show', 'similar', 'simple', 'skip', 'smallint', 'snapshot', 'some', 'sql', 'stable', 'standalone', 'start', 'statement', 'statistics', 'stdin', 'stdout', 'storage', 'stored', 'strict', 'strip', 'struct', 'subscription', 'substring', 'summarize', 'symmetric', 'sysid', 'system', 'table', 'tables', 'tablesample', 'tablespace', 'temp', 'template', 'temporary', 'text', 'then', 'ties', 'time', 'timestamp', 'to', 'trailing', 'transaction', 'transform', 'treat', 'trigger', 'trim', 'true', 'truncate', 'trusted', 'try_cast', 'type', 'types', 'unbounded', 'uncommitted', 'unencrypted', 'union', 'unique', 'unknown', 'unlisten', 'unlogged', 'unpivot', 'until', 'update', 'use', 'user', 'using', 'vacuum', 'valid', 'validate', 'validator', 'value', 'values', 'varchar', 'variable', 'variadic', 'varying', 'verbose', 'version', 'view', 'views', 'virtual', 'volatile', 'week', 'weeks', 'when', 'where', 'whitespace', 'window', 'with', 'within', 'without', 'work', 'wrapper', 'write', 'xml', 'xmlattributes', 'xmlconcat', 'xmlelement', 'xmlexists', 'xmlforest', 'xmlnamespaces', 'xmlparse', 'xmlpi', 'xmlroot', 'xmlserialize', 'xmltable', 'year', 'years', 'yes', 'zone',
]);

export const SYSTEM_DUCKDB_SCHEMAS = [
  'information_schema',
  'pg_catalog',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
  'pg_catalog',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
];

/**
 * Checks if a string needs is a valid DuckDB identifier or would need to be quoted.
 *
 * @param str The string to check
 * @returns `true` if the string doesn't need to be quoted, `false` otherwise
 */
export function checkValidDuckDBIdentifer(str: string): boolean {
  // Check if the string is already a valid unquoted identifier
  // Valid identifiers contain only alphanumeric chars and underscores, and don't start with a digit
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str) && !isReservedDuckDBKeyword(str);
}

/**
 * Converts an arbitrary string to a valid DuckDB identifier.
 * - Returns the string as-is if it's already a valid unquoted identifier
 * - Quotes the string and escapes any embedded quotes if necessary
 *
 * @param str The string to convert to a valid DuckDB identifier
 * @returns A valid DuckDB identifier
 */
export function toDuckDBIdentifier(str: string): string {
  // Check if the string is already a valid unquoted identifier
  // Valid identifiers contain only alphanumeric chars and underscores, and don't start with a digit
  if (checkValidDuckDBIdentifer(str)) {
    return str;
  }

  // If the string contains double quotes, escape them by doubling
  const escaped = str.replace(/"/g, '""');

  // Return the quoted identifier
  return `"${escaped}"`;
}

/**
 * Checks if a string is a DuckDB reserved keyword
 * Note: This is a simplified list - for production, use a complete list of DuckDB keywords
 */
export function isReservedDuckDBKeyword(str: string): boolean {
  return DUCKDB_RESERVED_KEYWORDS.has(str.toLowerCase());
}

/**
 * Helper function to check if a database name is reserved or already in use.
 * Used specifically to avoid errors when attaching databases with reserved names like "temp".
 *
 * @param name The database name to check
 * @param existingNames Set of existing database names to check against
 * @returns true if the name is reserved or already in use, false if it's usable
 */
export function isNameReservedOrInUse(name: string, existingNames: Set<string>): boolean {
  if (existingNames.has(name)) {
    return true;
  }
  return isReservedDuckDBKeyword(name);
}
