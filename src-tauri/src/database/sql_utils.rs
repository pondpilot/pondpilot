//! SQL utility helpers shared across commands/engine code for readability and reuse

/// Escape a SQL identifier for DuckDB (double-quote and escape inner quotes)
pub fn escape_identifier(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Escape a SQL string literal for DuckDB (single-quote and escape inner quotes)
pub fn escape_string_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Attachment specification for building ATTACH SQL statements
#[derive(Debug, Clone)]
pub struct AttachItem {
    pub db_name: String,
    pub url: String,
    pub read_only: bool,
}

/// Build a sequence of DETACH/ATTACH statements from an attachment specification
/// Special-case MotherDuck URLs (md:...), which do not support alias syntax
pub fn build_attach_statements(items: &[AttachItem]) -> Vec<String> {
    let mut stmts = Vec::new();
    for item in items {
        if item.url.trim().is_empty() {
            continue;
        }
        let db_ident = escape_identifier(&item.db_name);
        let url_lit = escape_string_literal(&item.url);
        // Always detach first to ensure clean attach
        stmts.push(format!("DETACH DATABASE IF EXISTS {}", db_ident));
        if item.url.starts_with("md:") {
            // MotherDuck uses simple ATTACH without alias
            stmts.push(format!("ATTACH {}", url_lit));
        } else if item.read_only {
            stmts.push(format!("ATTACH {} AS {} (READ_ONLY)", url_lit, db_ident));
        } else {
            stmts.push(format!("ATTACH {} AS {}", url_lit, db_ident));
        }
    }
    stmts
}
