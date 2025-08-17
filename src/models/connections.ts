export enum ConnectionType {
  Postgres = 'Postgres',
  MySQL = 'MySQL',
}

export enum SslMode {
  Disable = 'Disable',
  Allow = 'Allow',
  Prefer = 'Prefer',
  Require = 'Require',
  VerifyCa = 'VerifyCa',
  VerifyFull = 'VerifyFull',
}

export interface ConnectionTestConfig {
  name: string;
  connection_type: ConnectionType;
  host: string;
  port: number;
  database: string;
  read_only?: boolean;
  ssl_mode?: SslMode;
  connect_timeout?: number;
  query_timeout?: number;
  max_connections?: number;
  schema?: string;
  options?: Record<string, string>;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  connection_type: ConnectionType;
  host: string;
  port: number;
  database: string;
  secret_id: string;
  read_only?: boolean;
  ssl_mode?: SslMode;
  connect_timeout?: number;
  query_timeout?: number;
  max_connections?: number;
  schema?: string;
  options?: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_used?: string;
  tags: string[];
  description?: string;
}

export interface SaveConnectionRequest {
  name: string;
  connection_type: ConnectionType;
  host: string;
  port: number;
  database: string;
  secret_id: string;
  read_only?: boolean;
  ssl_mode?: SslMode;
  connect_timeout?: number;
  query_timeout?: number;
  max_connections?: number;
  schema?: string;
  tags: string[];
  description?: string;
}

export interface UpdateConnectionRequest {
  connection_id: string;
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  secret_id?: string;
  read_only?: boolean;
  ssl_mode?: SslMode;
  connect_timeout?: number;
  query_timeout?: number;
  max_connections?: number;
  schema?: string;
  tags?: string[];
  description?: string;
}

export interface ConnectionResponse {
  connection: ConnectionConfig;
}

export interface ConnectionListResponse {
  connections: ConnectionConfig[];
}

export interface ConnectionTypeInfo {
  value: string;
  label: string;
  default_port: number;
  supported_ssl_modes: string[];
}

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  [ConnectionType.Postgres]: 'PostgreSQL',
  [ConnectionType.MySQL]: 'MySQL',
};

export const CONNECTION_TYPE_ICONS: Record<ConnectionType, string> = {
  [ConnectionType.Postgres]: '🐘',
  [ConnectionType.MySQL]: '🐬',
};

export const SSL_MODE_LABELS: Record<SslMode, string> = {
  [SslMode.Disable]: 'Disable',
  [SslMode.Allow]: 'Allow',
  [SslMode.Prefer]: 'Prefer',
  [SslMode.Require]: 'Require',
  [SslMode.VerifyCa]: 'Verify CA',
  [SslMode.VerifyFull]: 'Verify Full',
};

export function getDefaultPort(connectionType: ConnectionType): number {
  switch (connectionType) {
    case ConnectionType.Postgres:
      return 5432;
    case ConnectionType.MySQL:
      return 3306;
    default:
      return 5432;
  }
}

export function getSupportedSslModes(connectionType: ConnectionType): SslMode[] {
  switch (connectionType) {
    case ConnectionType.Postgres:
      return [
        SslMode.Disable,
        SslMode.Allow,
        SslMode.Prefer,
        SslMode.Require,
        SslMode.VerifyCa,
        SslMode.VerifyFull,
      ];
    case ConnectionType.MySQL:
      return [SslMode.Disable, SslMode.Require];
    default:
      return [];
  }
}

export function getDefaultSslMode(connectionType: ConnectionType): SslMode {
  switch (connectionType) {
    case ConnectionType.Postgres:
      return SslMode.Prefer;
    case ConnectionType.MySQL:
      return SslMode.Require;
    default:
      return SslMode.Prefer;
  }
}
