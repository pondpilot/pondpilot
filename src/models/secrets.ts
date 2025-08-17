export enum SecretType {
  MotherDuck = 'MotherDuck',
  S3 = 'S3',
  R2 = 'R2',
  GCS = 'GCS',
  Azure = 'Azure',
  Postgres = 'Postgres',
  MySQL = 'MySQL',
  HTTP = 'HTTP',
  HuggingFace = 'HuggingFace',
  DuckLake = 'DuckLake',
}

export interface SecretMetadata {
  id: string;
  name: string;
  secret_type: SecretType;
  created_at: string;
  updated_at: string;
  last_used: string | null;
  tags: string[];
  description: string | null;
  scope: string | null;
}

export interface SecretFields {
  key_id?: string;
  secret?: string;
  token?: string; // For MotherDuck, HuggingFace, DuckLake
  username?: string; // For database authentication
  region?: string;
  account_id?: string;
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  endpoint?: string;
  session_token?: string;
  scope?: string;
}

export interface SaveSecretRequest {
  secret_type: SecretType;
  name: string;
  fields: SecretFields;
  tags: string[];
  scope?: string;
  description?: string;
}

export interface UpdateSecretRequest {
  secret_id: string;
  name?: string;
  fields?: SecretFields;
  tags?: string[];
  scope?: string;
}

export interface ApplySecretRequest {
  connection_id: string;
  secret_id: string;
}

export interface SecretResponse {
  metadata: SecretMetadata;
}

export interface SecretListResponse {
  secrets: SecretMetadata[];
}

export const SECRET_TYPE_LABELS: Record<SecretType, string> = {
  [SecretType.MotherDuck]: 'MotherDuck',
  [SecretType.S3]: 'Amazon S3',
  [SecretType.R2]: 'Cloudflare R2',
  [SecretType.GCS]: 'Google Cloud Storage',
  [SecretType.Azure]: 'Azure Blob Storage',
  [SecretType.Postgres]: 'PostgreSQL',
  [SecretType.MySQL]: 'MySQL',
  [SecretType.HTTP]: 'HTTP/HTTPS',
  [SecretType.HuggingFace]: 'Hugging Face',
  [SecretType.DuckLake]: 'DuckLake',
};

export const SECRET_TYPE_ICONS: Record<SecretType, string> = {
  [SecretType.MotherDuck]: '🦆',
  [SecretType.S3]: '☁️',
  [SecretType.R2]: '🌩️',
  [SecretType.GCS]: '🔵',
  [SecretType.Azure]: '☁️',
  [SecretType.Postgres]: '🐘',
  [SecretType.MySQL]: '🐬',
  [SecretType.HTTP]: '🌐',
  [SecretType.HuggingFace]: '🤗',
  [SecretType.DuckLake]: '🦆',
};

export function getRequiredFields(secretType: SecretType): (keyof SecretFields)[] {
  switch (secretType) {
    case SecretType.MotherDuck:
      return ['token'];
    case SecretType.S3:
      return ['key_id', 'secret'];
    case SecretType.R2:
      return ['account_id', 'key_id', 'secret'];
    case SecretType.GCS:
      return ['key_id', 'secret'];
    case SecretType.Azure:
      return ['tenant_id', 'client_id', 'client_secret'];
    case SecretType.Postgres:
    case SecretType.MySQL:
      return ['username', 'secret'];
    case SecretType.HTTP:
      return ['secret'];
    case SecretType.HuggingFace:
    case SecretType.DuckLake:
      return ['token'];
    default:
      return [];
  }
}

export function getFieldLabels(): Record<keyof SecretFields, string> {
  return {
    key_id: 'Access Key ID',
    secret: 'Secret / Password',
    token: 'Token',
    username: 'Username',
    region: 'Region',
    account_id: 'Account ID',
    tenant_id: 'Tenant ID',
    client_id: 'Client ID',
    client_secret: 'Client Secret',
    endpoint: 'Endpoint URL',
    session_token: 'Session Token',
    scope: 'Scope (Path Prefix)',
  };
}
