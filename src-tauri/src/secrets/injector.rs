use duckdb::Connection;

use super::models::{SecretCredentials, SecretType};
use super::errors::SecretError;

pub struct DuckDBSecretInjector;

impl DuckDBSecretInjector {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn inject_secret(
        &self,
        connection: &Connection,
        secret: &SecretCredentials,
    ) -> Result<(), SecretError> {
        let sql = self.build_create_secret(secret)?;
        
        connection.execute(&sql, []).map_err(|e| {
            SecretError::DuckDBInjection {
                secret_type: format!("{:?}", secret.metadata.secret_type),
                error: e.to_string(),
            }
        })?;
        
        Ok(())
    }
    
    pub async fn clear_secrets(
        &self,
        _connection: &Connection,
    ) -> Result<(), SecretError> {
        Ok(())
    }

    fn build_create_secret(&self, secret: &SecretCredentials) -> Result<String, SecretError> {
        let secret_name = format!("secret_{}", secret.metadata.id.to_string().replace("-", "_"));
        let creds = &secret.credentials;
        
        let sql = match secret.metadata.secret_type {
            SecretType::MotherDuck => {
                let token = creds.get("token")
                    .ok_or(SecretError::MissingCredential("token".to_string()))?;
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        TYPE MOTHERDUCK,
                        TOKEN '{}'
                    )",
                    secret_name,
                    escape_sql_string(token.expose())
                )
            },
            
            SecretType::S3 => {
                let mut params = vec![];
                
                params.push(format!("TYPE S3"));
                
                if let Some(key_id) = creds.get("key_id") {
                    params.push(format!("KEY_ID '{}'", escape_sql_string(key_id.expose())));
                }
                if let Some(secret) = creds.get("secret") {
                    params.push(format!("SECRET '{}'", escape_sql_string(secret.expose())));
                }
                if let Some(region) = creds.get("region") {
                    params.push(format!("REGION '{}'", escape_sql_string(region.expose())));
                }
                if let Some(session_token) = creds.get("session_token") {
                    params.push(format!("SESSION_TOKEN '{}'", escape_sql_string(session_token.expose())));
                }
                if let Some(endpoint) = creds.get("endpoint") {
                    params.push(format!("ENDPOINT '{}'", escape_sql_string(endpoint.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::R2 => {
                let mut params = vec![format!("TYPE R2")];
                
                if let Some(account_id) = creds.get("account_id") {
                    params.push(format!("ACCOUNT_ID '{}'", escape_sql_string(account_id.expose())));
                }
                if let Some(key_id) = creds.get("key_id") {
                    params.push(format!("KEY_ID '{}'", escape_sql_string(key_id.expose())));
                }
                if let Some(secret) = creds.get("secret") {
                    params.push(format!("SECRET '{}'", escape_sql_string(secret.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::GCS => {
                let mut params = vec![format!("TYPE GCS")];
                
                if let Some(key_id) = creds.get("key_id") {
                    params.push(format!("KEY_ID '{}'", escape_sql_string(key_id.expose())));
                }
                if let Some(secret) = creds.get("secret") {
                    params.push(format!("SECRET '{}'", escape_sql_string(secret.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::Azure => {
                let mut params = vec![format!("TYPE AZURE")];
                
                if let Some(tenant_id) = creds.get("tenant_id") {
                    params.push(format!("TENANT_ID '{}'", escape_sql_string(tenant_id.expose())));
                }
                if let Some(client_id) = creds.get("client_id") {
                    params.push(format!("CLIENT_ID '{}'", escape_sql_string(client_id.expose())));
                }
                if let Some(client_secret) = creds.get("client_secret") {
                    params.push(format!("CLIENT_SECRET '{}'", escape_sql_string(client_secret.expose())));
                }
                if let Some(account_id) = creds.get("account_id") {
                    params.push(format!("ACCOUNT_ID '{}'", escape_sql_string(account_id.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::Postgres => {
                let mut params = vec![format!("TYPE POSTGRES")];
                
                if let Some(host) = creds.get("host") {
                    params.push(format!("HOST '{}'", escape_sql_string(host.expose())));
                }
                if let Some(port) = creds.get("port") {
                    params.push(format!("PORT {}", port.expose()));
                }
                if let Some(database) = creds.get("database") {
                    params.push(format!("DATABASE '{}'", escape_sql_string(database.expose())));
                }
                if let Some(user) = creds.get("user") {
                    params.push(format!("USER '{}'", escape_sql_string(user.expose())));
                }
                if let Some(password) = creds.get("secret") {
                    params.push(format!("PASSWORD '{}'", escape_sql_string(password.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::MySQL => {
                let mut params = vec![format!("TYPE MYSQL")];
                
                if let Some(host) = creds.get("host") {
                    params.push(format!("HOST '{}'", escape_sql_string(host.expose())));
                }
                if let Some(port) = creds.get("port") {
                    params.push(format!("PORT {}", port.expose()));
                }
                if let Some(database) = creds.get("database") {
                    params.push(format!("DATABASE '{}'", escape_sql_string(database.expose())));
                }
                if let Some(user) = creds.get("user") {
                    params.push(format!("USER '{}'", escape_sql_string(user.expose())));
                }
                if let Some(password) = creds.get("secret") {
                    params.push(format!("PASSWORD '{}'", escape_sql_string(password.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::HTTP => {
                let mut params = vec![format!("TYPE HTTP")];
                
                if let Some(token) = creds.get("token") {
                    params.push(format!("BEARER_TOKEN '{}'", escape_sql_string(token.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::HuggingFace => {
                let mut params = vec![format!("TYPE HUGGINGFACE")];
                
                if let Some(token) = creds.get("token") {
                    params.push(format!("TOKEN '{}'", escape_sql_string(token.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
            
            SecretType::DuckLake => {
                let mut params = vec![format!("TYPE DUCKLAKE")];
                
                if let Some(token) = creds.get("token") {
                    params.push(format!("TOKEN '{}'", escape_sql_string(token.expose())));
                }
                
                format!(
                    "CREATE TEMPORARY SECRET IF NOT EXISTS {} (
                        {}
                    )",
                    secret_name,
                    params.join(",\n        ")
                )
            },
        };
        
        if let Some(scope) = &secret.metadata.scope {
            Ok(format!("{}, SCOPE '{}')", 
                sql.trim_end_matches(')'),
                escape_sql_string(scope)
            ))
        } else {
            Ok(sql)
        }
    }
}

pub fn escape_sql_string(s: &str) -> String {
    s.replace('\'', "''")
        .replace('\\', "\\\\")
        .replace('\0', "")
}