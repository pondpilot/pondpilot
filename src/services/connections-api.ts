import { invoke } from '@tauri-apps/api/core';

import {
  ConnectionConfig,
  ConnectionTestConfig,
  ConnectionType,
  SaveConnectionRequest,
  UpdateConnectionRequest,
  ConnectionResponse,
  ConnectionListResponse,
  ConnectionTypeInfo,
} from '../models/connections';

export class ConnectionsAPI {
  static async saveConnection(request: SaveConnectionRequest): Promise<ConnectionConfig> {
    const response = await invoke<ConnectionResponse>('save_connection', { request });
    return response.connection;
  }

  static async listConnections(connectionType?: ConnectionType): Promise<ConnectionConfig[]> {
    const response = await invoke<ConnectionListResponse>('list_connections', {
      connectionType: connectionType || null,
    });
    return response.connections;
  }

  static async getConnection(connectionId: string): Promise<ConnectionConfig> {
    const response = await invoke<ConnectionResponse>('get_connection', { connectionId });
    return response.connection;
  }

  static async deleteConnection(connectionId: string): Promise<void> {
    await invoke('delete_connection', { connectionId });
  }

  static async updateConnection(request: UpdateConnectionRequest): Promise<ConnectionConfig> {
    const response = await invoke<ConnectionResponse>('update_connection', { request });
    return response.connection;
  }

  static async testDatabaseConnection(connectionId: string): Promise<boolean> {
    return await invoke<boolean>('test_database_connection', { connectionId });
  }

  static async testDatabaseConnectionConfig(
    config: ConnectionTestConfig,
    secretId: string,
  ): Promise<boolean> {
    return await invoke<boolean>('test_database_connection_config', { config, secretId });
  }

  static async getConnectionTypes(): Promise<ConnectionTypeInfo[]> {
    return await invoke<ConnectionTypeInfo[]>('get_connection_types');
  }

  static async getConnectionWithCredentials(connectionId: string): Promise<string> {
    return await invoke<string>('get_connection_with_credentials', { connectionId });
  }

  static async registerMotherDuckAttachment(databaseUrl: string, secretId?: string): Promise<void> {
    await invoke('register_motherduck_attachment', {
      databaseUrl,
      secretId: secretId ?? null,
    });
  }

  static async attachRemoteDatabase(connectionId: string, databaseAlias: string): Promise<void> {
    await invoke('attach_remote_database', { connectionId, databaseAlias });
  }
}

export default ConnectionsAPI;
