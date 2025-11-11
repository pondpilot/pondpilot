import { invoke } from '@tauri-apps/api/core';

import {
  SecretType,
  SecretMetadata,
  SaveSecretRequest,
  UpdateSecretRequest,
  ApplySecretRequest,
  SecretResponse,
  SecretListResponse,
} from '../models/secrets';

export class SecretsAPI {
  static async saveSecret(request: SaveSecretRequest): Promise<SecretMetadata> {
    const response = await invoke<SecretResponse>('save_secret', { request });
    return response.metadata;
  }

  static async listSecrets(secretType?: SecretType): Promise<SecretMetadata[]> {
    const response = await invoke<SecretListResponse>('list_secrets', {
      secretType: secretType || null,
    });
    return response.secrets;
  }

  static async getSecret(secretId: string): Promise<SecretMetadata> {
    const response = await invoke<SecretResponse>('get_secret', { secretId });
    return response.metadata;
  }

  static async deleteSecret(secretId: string): Promise<void> {
    await invoke('delete_secret', { secretId });
  }

  static async updateSecret(request: UpdateSecretRequest): Promise<SecretMetadata> {
    const response = await invoke<SecretResponse>('update_secret', { request });
    return response.metadata;
  }

  static async testSecret(secretId: string): Promise<boolean> {
    return await invoke<boolean>('test_secret', { secretId });
  }

  static async applySecretToConnection(request: ApplySecretRequest): Promise<void> {
    await invoke('apply_secret_to_connection', { request });
  }

  static async registerStorageSecret(secretId: string): Promise<string> {
    return await invoke<string>('register_storage_secret', { secretId });
  }

  static async cleanupOrphanedSecrets(): Promise<string> {
    return await invoke<string>('cleanup_orphaned_secrets');
  }
}

export default SecretsAPI;
