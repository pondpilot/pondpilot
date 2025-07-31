import { IDBPDatabase } from 'idb';
import { PersistenceAdapter } from './types';

/**
 * IndexedDB adapter for web persistence
 * Wraps the existing IDB connection to match the PersistenceAdapter interface
 */
export class IndexedDBAdapter implements PersistenceAdapter {
  constructor(private db: IDBPDatabase) {}

  async get<T>(table: string, key: string): Promise<T | undefined> {
    try {
      return await this.db.get(table, key);
    } catch (error) {
      console.error(`IndexedDBAdapter.get error for ${table}/${key}:`, error);
      return undefined;
    }
  }

  async put<T>(table: string, value: T, key?: string): Promise<void> {
    try {
      await this.db.put(table, value, key);
    } catch (error) {
      console.error(`IndexedDBAdapter.put error for ${table}:`, error);
      throw error;
    }
  }

  async delete(table: string, key: string): Promise<void> {
    try {
      await this.db.delete(table, key);
    } catch (error) {
      console.error(`IndexedDBAdapter.delete error for ${table}/${key}:`, error);
      throw error;
    }
  }

  async clear(table: string): Promise<void> {
    try {
      await this.db.clear(table);
    } catch (error) {
      console.error(`IndexedDBAdapter.clear error for ${table}:`, error);
      throw error;
    }
  }

  async getAll<T>(table: string): Promise<T[]> {
    try {
      return await this.db.getAll(table);
    } catch (error) {
      console.error(`IndexedDBAdapter.getAll error for ${table}:`, error);
      return [];
    }
  }

  async putAll<T>(table: string, items: Array<{ key: string; value: T }>): Promise<void> {
    const tx = this.db.transaction(table, 'readwrite');
    await Promise.all([
      ...items.map(({ key, value }) => tx.store.put(value, key)),
      tx.done,
    ]);
  }

  async deleteAll(table: string, keys: string[]): Promise<void> {
    const tx = this.db.transaction(table, 'readwrite');
    await Promise.all([
      ...keys.map(key => tx.store.delete(key)),
      tx.done,
    ]);
  }
}