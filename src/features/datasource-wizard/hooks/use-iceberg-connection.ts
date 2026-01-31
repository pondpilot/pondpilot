import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { IcebergAuthType, IcebergCatalog } from '@models/data-source';
import { makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { executeWithRetry } from '@utils/connection-manager';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { buildIcebergSecretPayload, isManagedIcebergEndpoint } from '@utils/iceberg-catalog';
import {
  buildIcebergSecretQuery,
  buildDropSecretQuery,
  buildIcebergAttachQuery,
} from '@utils/iceberg-sql-builder';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { escapeSqlStringValue } from '@utils/sql-security';
import { useState, useCallback } from 'react';

export interface IcebergConnectionParams {
  catalogAlias: string;
  warehouseName: string;
  endpoint: string;
  endpointType: string;
  authType: IcebergAuthType;
  clientId: string;
  clientSecret: string;
  oauth2ServerUri: string;
  token: string;
  awsKeyId: string;
  awsSecret: string;
  defaultRegion: string;
  useCorsProxy: boolean;
}

/**
 * Generate a unique secret name for DuckDB, based on the catalog alias.
 */
function generateSecretName(alias: string): string {
  const suffix = Date.now().toString(36);
  return `iceberg_secret_${alias}_${suffix}`;
}

export function useIcebergConnection(pool: AsyncDuckDBConnectionPool | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const testConnection = useCallback(
    async (params: IcebergConnectionParams): Promise<boolean> => {
      if (!pool || isTesting || isLoading) return false;

      setIsTesting(true);

      const finishTesting = async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        setIsTesting(false);
      };

      const isManagedEndpoint = isManagedIcebergEndpoint(params.endpointType);
      const alias = params.catalogAlias.trim();
      const secretName = generateSecretName(alias);

      try {
        // Create secret
        const secretQuery = buildIcebergSecretQuery({
          secretName,
          authType: params.authType,
          useS3SecretType: isManagedEndpoint,
          clientId: params.clientId.trim(),
          clientSecret: params.clientSecret.trim(),
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          token: params.token.trim(),
          awsKeyId: params.awsKeyId.trim() || undefined,
          awsSecret: params.awsSecret.trim() || undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
        });
        await pool.query(secretQuery);

        // Attach
        const attachQuery = buildIcebergAttachQuery({
          warehouseName: params.warehouseName.trim(),
          catalogAlias: alias,
          endpoint: isManagedEndpoint ? undefined : params.endpoint.trim(),
          endpointType: isManagedEndpoint
            ? (params.endpointType as 'GLUE' | 'S3_TABLES')
            : undefined,
          secretName,
          useCorsProxy: params.useCorsProxy,
        });
        await executeWithRetry(pool, attachQuery, {
          maxRetries: 1,
          timeout: 15000,
        });

        // Verify
        const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${escapeSqlStringValue(alias)}'`;
        await pool.query(checkQuery);

        // Clean up test resources
        const detachQuery = `DETACH DATABASE ${toDuckDBIdentifier(alias)}`;
        await pool.query(detachQuery);
        await pool.query(buildDropSecretQuery(secretName));

        showSuccess({
          title: 'Connection successful',
          message: 'Iceberg catalog connection test passed',
        });

        await finishTesting();
        return true;
      } catch (error) {
        const message = sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
        showError({
          title: 'Connection failed',
          message: `Failed to connect: ${message}`,
        });

        // Best-effort cleanup
        try {
          await pool.query(buildDropSecretQuery(secretName));
        } catch {
          // Ignore cleanup errors
        }

        await finishTesting();
        return false;
      }
    },
    [pool, isTesting, isLoading],
  );

  const addCatalog = useCallback(
    async (params: IcebergConnectionParams, onClose: () => void): Promise<boolean> => {
      if (!pool || isLoading || isTesting) return false;

      setIsLoading(true);
      const isManagedEndpoint = isManagedIcebergEndpoint(params.endpointType);
      const alias = params.catalogAlias.trim();
      const secretName = generateSecretName(alias);

      try {
        // Store credentials in the encrypted secret store
        const secretRefId = makeSecretId();
        const credentials = {
          authType: params.authType,
          clientId: params.clientId.trim() || undefined,
          clientSecret: params.clientSecret.trim() || undefined,
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          token: params.token.trim() || undefined,
          awsKeyId: params.awsKeyId.trim() || undefined,
          awsSecret: params.awsSecret.trim() || undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
        };

        const { _iDbConn } = useAppStore.getState();
        if (_iDbConn) {
          const payload = buildIcebergSecretPayload(`Iceberg: ${alias}`, credentials);
          await putSecret(_iDbConn, secretRefId, payload);
        }

        const catalog: IcebergCatalog = {
          type: 'iceberg-catalog',
          id: makePersistentDataSourceId(),
          catalogAlias: alias,
          warehouseName: params.warehouseName.trim(),
          endpoint: params.endpoint.trim(),
          authType: params.authType,
          connectionState: 'connecting',
          attachedAt: Date.now(),
          useCorsProxy: params.useCorsProxy,
          secretName,
          endpointType: isManagedEndpoint
            ? (params.endpointType as 'GLUE' | 'S3_TABLES')
            : undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          secretRef: secretRefId,
        };

        const { dataSources, databaseMetadata } = useAppStore.getState();
        const newDataSources = new Map(dataSources);
        newDataSources.set(catalog.id, catalog);

        // Create secret
        const secretQuery = buildIcebergSecretQuery({
          secretName,
          authType: params.authType,
          useS3SecretType: isManagedEndpoint,
          clientId: params.clientId.trim(),
          clientSecret: params.clientSecret.trim(),
          oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
          token: params.token.trim(),
          awsKeyId: params.awsKeyId.trim() || undefined,
          awsSecret: params.awsSecret.trim() || undefined,
          defaultRegion: params.defaultRegion.trim() || undefined,
        });
        await pool.query(secretQuery);

        // Attach
        const attachQuery = buildIcebergAttachQuery({
          warehouseName: catalog.warehouseName,
          catalogAlias: alias,
          endpoint: isManagedEndpoint ? undefined : catalog.endpoint,
          endpointType: catalog.endpointType,
          secretName,
          useCorsProxy: params.useCorsProxy,
        });
        await executeWithRetry(pool, attachQuery, {
          maxRetries: 3,
          timeout: 30000,
          retryDelay: 2000,
          exponentialBackoff: true,
        });

        // Verify
        const checkQuery = `SELECT database_name FROM duckdb_databases WHERE database_name = '${escapeSqlStringValue(alias)}'`;
        let dbFound = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!dbFound && attempts < maxAttempts) {
          try {
            const result = await pool.query(checkQuery);
            if (result && result.numRows > 0) {
              dbFound = true;
            } else {
              throw new Error('Catalog not found in duckdb_databases');
            }
          } catch (error) {
            attempts += 1;
            if (attempts >= maxAttempts) {
              throw new Error(
                `Catalog ${alias} could not be verified after ${maxAttempts} attempts`,
              );
            }
            console.warn(`Attempt ${attempts}: Catalog not ready yet, waiting...`);
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        catalog.connectionState = 'connected';
        newDataSources.set(catalog.id, catalog);

        try {
          const remoteMetadata = await getDatabaseModel(pool, [alias]);
          const newMetadata = new Map(databaseMetadata);
          for (const [dbName, dbModel] of remoteMetadata) {
            newMetadata.set(dbName, dbModel);
          }
          useAppStore.setState(
            { dataSources: newDataSources, databaseMetadata: newMetadata },
            false,
            'DatasourceWizard/addIcebergCatalog',
          );
        } catch (metadataError) {
          console.error('Failed to load metadata:', metadataError);
          useAppStore.setState(
            { dataSources: newDataSources },
            false,
            'DatasourceWizard/addIcebergCatalog',
          );
        }

        const { _iDbConn: iDbConn } = useAppStore.getState();
        if (iDbConn) {
          await persistPutDataSources(iDbConn, [catalog]);
        }

        showSuccess({
          title: 'Catalog added',
          message: `Successfully connected to Iceberg catalog '${alias}'`,
        });
        onClose();
        return true;
      } catch (error) {
        const message = sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
        showError({
          title: 'Failed to add catalog',
          message: `Error: ${message}`,
        });

        // Best-effort cleanup
        try {
          await pool.query(buildDropSecretQuery(secretName));
        } catch {
          // Ignore cleanup errors
        }

        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [pool, isLoading, isTesting],
  );

  return { isLoading, isTesting, testConnection, addCatalog };
}
