export const GET_VIEWS_SQL_QUERY = "SELECT * FROM duckdb_views WHERE tags['sourceId'] IS NOT NULL";
export const GET_DBS_SQL_QUERY = 'SELECT * FROM duckdb_databases()';
