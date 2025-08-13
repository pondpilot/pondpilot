import { ConnectionPool } from '@engines/types';
import { RemoteDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';
import { updateRemoteDbConnectionState } from '@utils/remote-database';
import { isMotherDuckUrl } from '@utils/url-helpers';

import { SecretsAPI } from '../services/secrets-api';

/**
 * Manages MotherDuck database connections, handling the constraint that
 * only one instance of a database with the same name can be attached at a time
 */
export class MotherDuckManager {
  /**
   * Switches to a different MotherDuck instance for a database with the same name
   * This involves detaching the currently attached one and attaching the new one
   */
  static async switchToInstance(pool: ConnectionPool, targetDataSource: RemoteDB): Promise<void> {
    if (!isMotherDuckUrl(targetDataSource.url)) {
      throw new Error('Not a MotherDuck database');
    }

    const { dataSources } = useAppStore.getState();
    const { dbName } = targetDataSource;

    // Find all MotherDuck databases with the same name
    const conflictingDbs = Array.from(dataSources.values()).filter(
      (ds) => ds.type === 'remote-db' && isMotherDuckUrl(ds.url) && ds.dbName === dbName,
    ) as RemoteDB[];

    // First, detach any currently attached database with this name
    const conn = await pool.acquire();
    try {
      // Check if database is currently attached
      const checkResult = await conn.execute(
        `SELECT database_name FROM duckdb_databases WHERE database_name = ${quote(dbName, { single: true })}`,
      );

      if (checkResult && checkResult.rows && checkResult.rows.length > 0) {
        // Detach the current database
        await conn.execute(`DETACH DATABASE ${toDuckDBIdentifier(dbName)}`);
        console.log(`Detached database ${dbName} to switch instances`);

        // Mark the previously connected one as disconnected
        for (const db of conflictingDbs) {
          if (db.id !== targetDataSource.id) {
            updateRemoteDbConnectionState(
              db.id,
              'disconnected',
              'Disconnected to switch to another instance',
            );
          }
        }
      }

      // Apply the secret to set environment variable for the target instance if available
      if (targetDataSource.instanceId) {
        try {
          // Apply the secret to set MOTHERDUCK_TOKEN environment variable
          await SecretsAPI.applySecretToConnection({
            connection_id: `motherduck_reconnect_${targetDataSource.instanceId}`,
            secret_id: targetDataSource.instanceId,
          });
          console.log('Applied MotherDuck secret to environment');
        } catch (secretError) {
          console.warn('Failed to apply MotherDuck secret:', secretError);
        }
      }

      // Attach the specific database
      try {
        const attachQuery = `ATTACH 'md:${dbName}'`;
        await conn.execute(attachQuery);
        console.log(`Attached MotherDuck database ${dbName}`);
      } catch (attachError: any) {
        const msg = String(attachError?.message || attachError);
        if (!/already attached|already in use/i.test(msg)) {
          throw attachError;
        }
        console.log(`MotherDuck database ${dbName} already attached`);
      }

      // Mark the new one as connected
      updateRemoteDbConnectionState(targetDataSource.id, 'connected');
      console.log(
        `Switched to MotherDuck instance ${targetDataSource.instanceName || 'default'} for database ${dbName}`,
      );
    } finally {
      await pool.release(conn);
    }
  }

  /**
   * Disconnects a MotherDuck database
   */
  static async disconnect(pool: ConnectionPool, dataSource: RemoteDB): Promise<void> {
    if (!isMotherDuckUrl(dataSource.url)) {
      throw new Error('Not a MotherDuck database');
    }

    const conn = await pool.acquire();
    try {
      await conn.execute(`DETACH DATABASE ${toDuckDBIdentifier(dataSource.dbName)}`);
      updateRemoteDbConnectionState(dataSource.id, 'disconnected');
      console.log(`Disconnected MotherDuck database ${dataSource.dbName}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // If already detached, still mark as disconnected
      if (/not found|does not exist/i.test(msg)) {
        updateRemoteDbConnectionState(dataSource.id, 'disconnected');
      } else {
        throw error;
      }
    } finally {
      await pool.release(conn);
    }
  }

  /**
   * Connects a MotherDuck database
   * Will automatically disconnect any conflicting database with the same name
   */
  static async connect(pool: ConnectionPool, dataSource: RemoteDB): Promise<void> {
    // This is essentially the same as switchToInstance
    await this.switchToInstance(pool, dataSource);
  }
}
