/* eslint-disable max-classes-per-file */
import { IDBPDatabase, IDBPTransaction } from 'idb';

import { PersistenceAdapter, PERSISTENCE_TABLES } from './types';

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
    await Promise.all([...items.map(({ key, value }) => tx.store.put(value, key)), tx.done]);
  }

  async deleteAll(table: string, keys: string[]): Promise<void> {
    const tx = this.db.transaction(table, 'readwrite');
    await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
  }

  async transaction<T>(fn: (adapter: PersistenceAdapter) => Promise<T>): Promise<T> {
    // Create a transaction-scoped adapter
    // IndexedDB requires knowing all tables upfront, so we create a transaction for all persistence tables
    const tables = Object.values(PERSISTENCE_TABLES);
    const tx = this.db.transaction(tables, 'readwrite');

    try {
      // Create an adapter that uses this transaction
      const txAdapter = new TransactionIndexedDBAdapter(tx);

      // Execute the function with the transaction adapter
      const result = await fn(txAdapter);

      // Wait for transaction to complete
      await tx.done;

      return result;
    } catch (error) {
      // Transaction will auto-rollback on error
      console.error('IndexedDBAdapter.transaction error:', error);
      throw error;
    }
  }
}

/**
 * Transaction-scoped IndexedDB adapter
 * Performs all operations within a single IndexedDB transaction
 */
class TransactionIndexedDBAdapter implements PersistenceAdapter {
  constructor(private tx: IDBPTransaction<any, string[], 'readwrite'>) {}

  async get<T>(table: string, key: string): Promise<T | undefined> {
    try {
      return await this.tx.objectStore(table).get(key);
    } catch (error) {
      console.error(`TransactionIndexedDBAdapter.get error for ${table}/${key}:`, error);
      return undefined;
    }
  }

  async put<T>(table: string, value: T, key?: string): Promise<void> {
    try {
      await this.tx.objectStore(table).put(value, key);
    } catch (error) {
      console.error(`TransactionIndexedDBAdapter.put error for ${table}:`, error);
      throw error;
    }
  }

  async delete(table: string, key: string): Promise<void> {
    try {
      await this.tx.objectStore(table).delete(key);
    } catch (error) {
      console.error(`TransactionIndexedDBAdapter.delete error for ${table}/${key}:`, error);
      throw error;
    }
  }

  async clear(table: string): Promise<void> {
    try {
      await this.tx.objectStore(table).clear();
    } catch (error) {
      console.error(`TransactionIndexedDBAdapter.clear error for ${table}:`, error);
      throw error;
    }
  }

  async getAll<T>(table: string): Promise<T[]> {
    try {
      return await this.tx.objectStore(table).getAll();
    } catch (error) {
      console.error(`TransactionIndexedDBAdapter.getAll error for ${table}:`, error);
      return [];
    }
  }

  async putAll<T>(table: string, items: Array<{ key: string; value: T }>): Promise<void> {
    const store = this.tx.objectStore(table);
    await Promise.all(items.map(({ key, value }) => store.put(value, key)));
  }

  async deleteAll(table: string, keys: string[]): Promise<void> {
    const store = this.tx.objectStore(table);
    await Promise.all(keys.map((key) => store.delete(key)));
  }

  async transaction<T>(fn: (adapter: PersistenceAdapter) => Promise<T>): Promise<T> {
    // Nested transactions are not supported in IndexedDB
    // Just execute the function with this adapter (which is already in a transaction)
    return await fn(this);
  }
}
