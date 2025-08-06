/// SQL statement classification for DuckDB
/// Mirrors the TypeScript implementation in src/utils/editor/sql.ts

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqlStatement {
    Analyze,
    Alter,
    Attach,
    Detach,
    Call,
    Checkpoint,
    ForceCheckpoint,
    CommentOn,
    Copy,
    Create,
    Drop,
    Delete,
    Truncate,
    Describe,
    Show,
    ExportDatabase,
    ImportDatabase,
    Insert,
    Install,
    Load,
    Pivot,
    Unpivot,
    From,
    Explain,
    Select,
    Set,
    Reset,
    Summarize,
    BeginTransaction,
    Commit,
    Rollback,
    Abort,
    Update,
    With,
    Use,
    Vacuum,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SqlStatementType {
    DDL,     // Data Definition Language
    DML,     // Data Manipulation Language
    TCL,     // Transaction Control Language
    UTL,     // Utility Commands
    Unknown,
}

impl SqlStatement {
    /// Get the SQL statement type category
    pub fn statement_type(&self) -> SqlStatementType {
        match self {
            SqlStatement::Alter | SqlStatement::Create | SqlStatement::Drop | SqlStatement::CommentOn => {
                SqlStatementType::DDL
            }
            SqlStatement::Call
            | SqlStatement::Delete
            | SqlStatement::Truncate
            | SqlStatement::Describe
            | SqlStatement::Show
            | SqlStatement::Insert
            | SqlStatement::Pivot
            | SqlStatement::Unpivot
            | SqlStatement::From
            | SqlStatement::Select
            | SqlStatement::Summarize
            | SqlStatement::Update => SqlStatementType::DML,
            SqlStatement::BeginTransaction
            | SqlStatement::Commit
            | SqlStatement::Rollback
            | SqlStatement::Abort => SqlStatementType::TCL,
            SqlStatement::Analyze
            | SqlStatement::Attach
            | SqlStatement::Detach
            | SqlStatement::Checkpoint
            | SqlStatement::ForceCheckpoint
            | SqlStatement::Copy
            | SqlStatement::ExportDatabase
            | SqlStatement::ImportDatabase
            | SqlStatement::Install
            | SqlStatement::Load
            | SqlStatement::Explain
            | SqlStatement::Set
            | SqlStatement::Reset
            | SqlStatement::Use
            | SqlStatement::Vacuum => SqlStatementType::UTL,
            SqlStatement::With | SqlStatement::Unknown => SqlStatementType::Unknown,
        }
    }

    /// Check if this statement returns a result set
    pub fn returns_result_set(&self) -> bool {
        matches!(
            self,
            SqlStatement::Select
                | SqlStatement::With
                | SqlStatement::Describe
                | SqlStatement::Show
                | SqlStatement::Pivot
                | SqlStatement::Unpivot
                | SqlStatement::From
                | SqlStatement::Summarize
                | SqlStatement::Call
                | SqlStatement::Explain
        )
    }

    /// Parse the beginning of a SQL statement to classify it
    pub fn from_sql(sql: &str) -> Self {
        let trimmed = sql.trim().to_uppercase();
        
        // Handle multi-word statements first
        if trimmed.starts_with("FORCE CHECKPOINT") {
            return SqlStatement::ForceCheckpoint;
        }
        if trimmed.starts_with("COMMENT ON") {
            return SqlStatement::CommentOn;
        }
        if trimmed.starts_with("EXPORT DATABASE") {
            return SqlStatement::ExportDatabase;
        }
        if trimmed.starts_with("IMPORT DATABASE") {
            return SqlStatement::ImportDatabase;
        }
        if trimmed.starts_with("BEGIN TRANSACTION") || trimmed.starts_with("BEGIN") {
            return SqlStatement::BeginTransaction;
        }

        // Get first word
        let first_word = trimmed.split_whitespace().next().unwrap_or("");
        
        match first_word {
            "ANALYZE" => SqlStatement::Analyze,
            "ALTER" => SqlStatement::Alter,
            "ATTACH" => SqlStatement::Attach,
            "DETACH" => SqlStatement::Detach,
            "CALL" => SqlStatement::Call,
            "CHECKPOINT" => SqlStatement::Checkpoint,
            "COPY" => SqlStatement::Copy,
            "CREATE" => SqlStatement::Create,
            "DROP" => SqlStatement::Drop,
            "DELETE" => SqlStatement::Delete,
            "TRUNCATE" => SqlStatement::Truncate,
            "DESCRIBE" => SqlStatement::Describe,
            "SHOW" => SqlStatement::Show,
            "INSERT" => SqlStatement::Insert,
            "INSTALL" => SqlStatement::Install,
            "LOAD" => SqlStatement::Load,
            "PIVOT" => SqlStatement::Pivot,
            "UNPIVOT" => SqlStatement::Unpivot,
            "FROM" => SqlStatement::From,
            "EXPLAIN" => SqlStatement::Explain,
            "SELECT" => SqlStatement::Select,
            "SET" => SqlStatement::Set,
            "RESET" => SqlStatement::Reset,
            "SUMMARIZE" => SqlStatement::Summarize,
            "COMMIT" => SqlStatement::Commit,
            "ROLLBACK" => SqlStatement::Rollback,
            "ABORT" => SqlStatement::Abort,
            "UPDATE" => SqlStatement::Update,
            "WITH" => SqlStatement::With,
            "USE" => SqlStatement::Use,
            "VACUUM" => SqlStatement::Vacuum,
            _ => SqlStatement::Unknown,
        }
    }
}

pub struct ClassifiedSqlStatement {
    // TODO: Use for query routing and optimization
    #[allow(dead_code)]
    pub code: String,
    pub statement_type: SqlStatement,
    // TODO: Use for query categorization
    #[allow(dead_code)]
    pub sql_type: SqlStatementType,
    pub returns_result_set: bool,
}

impl ClassifiedSqlStatement {
    pub fn classify(sql: &str) -> Self {
        let statement_type = SqlStatement::from_sql(sql);
        let sql_type = statement_type.statement_type();
        let returns_result_set = statement_type.returns_result_set();
        
        Self {
            code: sql.to_string(),
            statement_type,
            sql_type,
            returns_result_set,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classification() {
        let tests = vec![
            ("SELECT * FROM users", SqlStatement::Select, true),
            ("INSERT INTO users VALUES (1)", SqlStatement::Insert, false),
            ("CREATE TABLE foo (id INT)", SqlStatement::Create, false),
            ("INSTALL httpfs", SqlStatement::Install, false),
            ("LOAD httpfs", SqlStatement::Load, false),
            ("WITH cte AS (SELECT 1) SELECT * FROM cte", SqlStatement::With, true),
            ("DESCRIBE TABLE users", SqlStatement::Describe, true),
        ];

        for (sql, expected_type, expected_returns_result) in tests {
            let classified = ClassifiedSqlStatement::classify(sql);
            assert_eq!(classified.statement_type, expected_type);
            assert_eq!(classified.returns_result_set, expected_returns_result);
        }
    }
}