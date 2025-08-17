use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SecretType {
    MotherDuck,
    S3,
    R2,
    GCS,
    Azure,
    Postgres,
    MySQL,
    HTTP,
    HuggingFace,
    DuckLake,
}

impl SecretType {
    pub fn to_string(&self) -> String {
        match self {
            SecretType::MotherDuck => "motherduck",
            SecretType::S3 => "s3",
            SecretType::R2 => "r2",
            SecretType::GCS => "gcs",
            SecretType::Azure => "azure",
            SecretType::Postgres => "postgres",
            SecretType::MySQL => "mysql",
            SecretType::HTTP => "http",
            SecretType::HuggingFace => "huggingface",
            SecretType::DuckLake => "ducklake",
        }.to_string()
    }

    pub fn from_string(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "motherduck" => Some(SecretType::MotherDuck),
            "s3" => Some(SecretType::S3),
            "r2" => Some(SecretType::R2),
            "gcs" => Some(SecretType::GCS),
            "azure" => Some(SecretType::Azure),
            "postgres" => Some(SecretType::Postgres),
            "mysql" => Some(SecretType::MySQL),
            "http" => Some(SecretType::HTTP),
            "huggingface" => Some(SecretType::HuggingFace),
            "ducklake" => Some(SecretType::DuckLake),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretMetadata {
    pub id: Uuid,
    pub name: String,
    pub secret_type: SecretType,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
    pub description: Option<String>,
    pub scope: Option<String>,
}

#[derive(Debug)]
pub struct SecretCredentials {
    pub metadata: SecretMetadata,
    pub credentials: HashMap<String, SecureString>,
}

impl Drop for SecretCredentials {
    fn drop(&mut self) {
        for (_, value) in self.credentials.iter_mut() {
            value.zeroize();
        }
    }
}

#[derive(Debug, Clone, Zeroize, ZeroizeOnDrop)]
pub struct SecureString {
    data: Vec<u8>,
}

impl SecureString {
    pub fn new(value: impl Into<String>) -> Self {
        Self {
            data: value.into().into_bytes(),
        }
    }
    
    pub fn expose(&self) -> &str {
        std::str::from_utf8(&self.data).unwrap_or_default()
    }
}

impl Serialize for SecureString {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.expose().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for SecureString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(SecureString::new(s))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretFields {
    // S3/R2/GCS fields
    pub key_id: Option<String>,
    pub secret: Option<String>,
    pub region: Option<String>,
    pub session_token: Option<String>,
    pub endpoint: Option<String>,
    
    // Azure fields
    pub account_name: Option<String>,
    pub account_id: Option<String>,
    pub tenant_id: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    
    // Database fields
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    
    // API token fields
    pub token: Option<String>,
    
    // HTTP auth fields
    pub bearer_token: Option<String>,
    pub basic_username: Option<String>,
    pub basic_password: Option<String>,
    
    // Other
    pub scope: Option<String>,
}

impl Default for SecretFields {
    fn default() -> Self {
        Self {
            key_id: None,
            secret: None,
            region: None,
            session_token: None,
            endpoint: None,
            account_name: None,
            account_id: None,
            tenant_id: None,
            client_id: None,
            client_secret: None,
            host: None,
            port: None,
            database: None,
            username: None,
            password: None,
            token: None,
            bearer_token: None,
            basic_username: None,
            basic_password: None,
            scope: None,
        }
    }
}