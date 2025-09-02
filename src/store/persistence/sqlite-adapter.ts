import { invoke } from '@tauri-apps/api/core';

import { PersistenceAdapter } from './types';

/**
 * SQLite adapter for Tauri persistence
 * Communicates with the Rust backend to store data in SQLite
 */
export class SQLiteAdapter implements PersistenceAdapter {
  async get<T>(table: string, key: string): Promise<T | undefined> {
    try {
      const result = await invoke<T | null>('sqlite_get', { table, key });
      return result ?? undefined;
    } catch (error) {
      console.error(`SQLiteAdapter.get error for ${table}/${key}:`, error);
      return undefined;
    }
  }

  async put<T>(table: string, value: T, key?: string): Promise<void> {
    try {
      await invoke('sqlite_put', { table, value, key });
    } catch (error) {
      console.error(`SQLiteAdapter.put error for ${table}:`, error);
      throw error;
    }
  }

  async delete(table: string, key: string): Promise<void> {
    try {
      await invoke('sqlite_delete', { table, key });
    } catch (error) {
      console.error(`SQLiteAdapter.delete error for ${table}/${key}:`, error);
      throw error;
    }
  }

  async clear(table: string): Promise<void> {
    try {
      await invoke('sqlite_clear', { table });
    } catch (error) {
      console.error(`SQLiteAdapter.clear error for ${table}:`, error);
      throw error;
    }
  }

  async getAll<T>(table: string): Promise<T[]> {
    try {
      const result = await invoke<T[]>('sqlite_get_all', { table });
      return result || [];
    } catch (error) {
      console.error(`SQLiteAdapter.getAll error for ${table}:`, error);
      return [];
    }
  }

  async putAll<T>(table: string, items: Array<{ key: string; value: T }>): Promise<void> {
    try {
      await invoke('sqlite_put_all', { table, items });
    } catch (error) {
      console.error(`SQLiteAdapter.putAll error for ${table}:`, error);
      // Fallback: sequential puts
      for (const { key, value } of items) {
        await this.put(table, value, key);
      }
    }
  }

  async deleteAll(table: string, keys: string[]): Promise<void> {
    try {
      await invoke('sqlite_delete_all', { table, keys });
    } catch (error) {
      console.error(`SQLiteAdapter.deleteAll error for ${table}:`, error);
      // Fallback: sequential deletes
      for (const key of keys) {
        await this.delete(table, key);
      }
    }
  }
}
