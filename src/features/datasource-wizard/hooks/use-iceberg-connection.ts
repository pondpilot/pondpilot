import { showError, showSuccess } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { getDatabaseModel } from '@controllers/db/duckdb-meta';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { IcebergAuthType, IcebergCatalog } from '@models/data-source';
import { deleteSecret, makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { makePersistentDataSourceId } from '@utils/data-source';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import {
  attachAndVerifyIcebergCatalog,
  buildIcebergSecretPayload,
  isManagedIcebergEndpoint,
} from '@utils/iceberg-catalog';
import { buildDropSecretQuery } from '@utils/iceberg-sql-builder';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { useState, useCallback, useRef } from 'react';

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

  // Synchronous refs guard against double-click races. React state updates
  // are batched asynchronously, so two rapid clicks could both see
  // isLoading/isTesting as false. The refs are updated immediately.
  const testingRef = useRef(false);
  const loadingRef = useRef(false);

  const testConnection = useCallback(
    async (params: IcebergConnectionParams): Promise<boolean> => {
      if (!pool || testingRef.current || loadingRef.current) return false;
      testingRef.current = true;

      setIsTesting(true);

      // Defer the state reset via microtask to avoid React state updates
      // during the same render cycle that triggered the async callback.
      const finishTesting = async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        testingRef.current = false;
        setIsTesting(false);
      };

      const isManagedEndpoint = isManagedIcebergEndpoint(params.endpointType);
      const alias = params.catalogAlias.trim();
      const secretName = generateSecretName(alias);

      try {
        // Use shared attach-and-verify with short settle delay for testing
        await attachAndVerifyIcebergCatalog({
          pool,
          secretName,
          catalogAlias: alias,
          warehouseName: params.warehouseName.trim(),
          credentials: {
            authType: params.authType,
            clientId: params.clientId.trim() || undefined,
            clientSecret: params.clientSecret.trim() || undefined,
            oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
            token: params.token.trim() || undefined,
            awsKeyId: params.awsKeyId.trim() || undefined,
            awsSecret: params.awsSecret.trim() || undefined,
            defaultRegion: params.defaultRegion.trim() || undefined,
          },
          endpoint: isManagedEndpoint ? undefined : params.endpoint.trim(),
          endpointType: isManagedEndpoint
            ? (params.endpointType as 'GLUE' | 'S3_TABLES')
            : undefined,
          useCorsProxy: params.useCorsProxy,
          settleDelayMs: 0,
          maxVerifyAttempts: 1,
        });

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
    [pool],
  );

  const addCatalog = useCallback(
    async (params: IcebergConnectionParams, onClose: () => void): Promise<boolean> => {
      if (!pool || loadingRef.current || testingRef.current) return false;
      loadingRef.current = true;

      setIsLoading(true);
      const isManagedEndpoint = isManagedIcebergEndpoint(params.endpointType);
      const alias = params.catalogAlias.trim();
      const secretName = generateSecretName(alias);
      const secretRefId = makeSecretId();
      const { _iDbConn: iDbConn } = useAppStore.getState();
      let secretPersisted = false;

      try {
        // Store credentials in the encrypted secret store
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

        if (iDbConn) {
          const payload = buildIcebergSecretPayload(`Iceberg: ${alias}`, credentials);
          await putSecret(iDbConn, secretRefId, payload);
          secretPersisted = true;
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

        // Attach and verify using shared utility
        await attachAndVerifyIcebergCatalog({
          pool,
          secretName,
          catalogAlias: alias,
          warehouseName: catalog.warehouseName,
          credentials: {
            authType: params.authType,
            clientId: params.clientId.trim() || undefined,
            clientSecret: params.clientSecret.trim() || undefined,
            oauth2ServerUri: params.oauth2ServerUri.trim() || undefined,
            token: params.token.trim() || undefined,
            awsKeyId: params.awsKeyId.trim() || undefined,
            awsSecret: params.awsSecret.trim() || undefined,
            defaultRegion: params.defaultRegion.trim() || undefined,
          },
          endpoint: isManagedEndpoint ? undefined : catalog.endpoint,
          endpointType: catalog.endpointType,
          useCorsProxy: params.useCorsProxy,
          maxVerifyAttempts: 3,
        });

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

        const { _iDbConn: currentIDbConn } = useAppStore.getState();
        if (currentIDbConn) {
          await persistPutDataSources(currentIDbConn, [catalog]);
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

        if (secretPersisted && iDbConn) {
          try {
            await deleteSecret(iDbConn, secretRefId);
          } catch {
            // Ignore cleanup errors
          }
        }

        return false;
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    },
    [pool],
  );

  return { isLoading, isTesting, testConnection, addCatalog };
}
