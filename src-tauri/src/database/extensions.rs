// Centralized extension allowlist to avoid drift across modules
// Accept canonical and historical scanner names for compatibility across DuckDB versions
pub const ALLOWED_EXTENSIONS: &[&str] = &[
    // Core + common
    "httpfs",
    "parquet",
    "json",
    "excel",
    "spatial",
    "arrow",
    "aws",
    "azure",
    "gsheets",
    "read_stat",
    "motherduck",
    "iceberg",
    "delta",
    // Database scanners (canonical and historical names)
    "postgres",
    "postgres_scanner",
    "mysql",
    "mysql_scanner",
    "sqlite",
    "sqlite_scanner",
];

