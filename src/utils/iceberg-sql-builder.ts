/**
 * SQL query builders for DuckDB Iceberg REST catalog integration.
 *
 * Generates CREATE SECRET, DROP SECRET, and ATTACH statements
 * for connecting to Iceberg REST catalogs.
 */

import { IcebergAuthType } from '@models/data-source';
import { wrapWithCorsProxyPathBased, isRemoteUrl } from '@utils/cors-proxy-config';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import { quote } from '@utils/helpers';

interface IcebergSecretOptions {
  secretName: string;
  authType: IcebergAuthType;
  /** Whether to use S3 secret type (for GLUE/S3_TABLES endpoint types) */
  useS3SecretType?: boolean;
  /** OAuth2 client ID */
  clientId?: string;
  /** OAuth2 client secret */
  clientSecret?: string;
  /** OAuth2 server URI for token exchange */
  oauth2ServerUri?: string;
  /** Bearer token */
  token?: string;
  /** AWS access key ID (for SigV4 auth) */
  awsKeyId?: string;
  /** AWS secret access key (for SigV4 auth) */
  awsSecret?: string;
  /** Default AWS region for SigV4 */
  defaultRegion?: string;
}

/**
 * Builds a CREATE OR REPLACE SECRET statement for Iceberg authentication.
 *
 * For managed AWS services (S3 Tables, Glue), uses TYPE s3 with KEY_ID/SECRET.
 * For generic REST catalogs, uses TYPE iceberg with auth-specific params.
 */
export function buildIcebergSecretQuery(options: IcebergSecretOptions): string {
  const { secretName, authType, useS3SecretType } = options;
  const parts: string[] = [];

  if (useS3SecretType) {
    // Managed AWS service — use S3 secret type with IAM credentials
    parts.push('TYPE s3');
    if (options.awsKeyId) {
      parts.push(`KEY_ID ${quote(options.awsKeyId, { single: true })}`);
    }
    if (options.awsSecret) {
      parts.push(`SECRET ${quote(options.awsSecret, { single: true })}`);
    }
    if (options.defaultRegion) {
      parts.push(`REGION ${quote(options.defaultRegion, { single: true })}`);
    }
  } else {
    // Generic REST catalog — use iceberg secret type
    parts.push('TYPE iceberg');

    switch (authType) {
      case 'oauth2':
        parts.push(`CLIENT_ID ${quote(options.clientId ?? '', { single: true })}`);
        parts.push(`CLIENT_SECRET ${quote(options.clientSecret ?? '', { single: true })}`);
        if (options.oauth2ServerUri) {
          parts.push(`OAUTH2_SERVER_URI ${quote(options.oauth2ServerUri, { single: true })}`);
        }
        break;
      case 'bearer':
        parts.push(`TOKEN ${quote(options.token ?? '', { single: true })}`);
        break;
      case 'sigv4':
        // SigV4 on generic REST — pass AWS credentials if provided
        if (options.awsKeyId) {
          parts.push(`KEY_ID ${quote(options.awsKeyId, { single: true })}`);
        }
        if (options.awsSecret) {
          parts.push(`SECRET ${quote(options.awsSecret, { single: true })}`);
        }
        if (options.defaultRegion) {
          parts.push(`REGION ${quote(options.defaultRegion, { single: true })}`);
        }
        break;
      case 'none':
        // No additional auth params
        break;
    }
  }

  const escapedName = toDuckDBIdentifier(secretName);
  return `CREATE OR REPLACE SECRET ${escapedName} (\n  ${parts.join(',\n  ')}\n)`;
}

/**
 * Builds a DROP SECRET IF EXISTS statement.
 */
export function buildDropSecretQuery(secretName: string): string {
  const escapedName = toDuckDBIdentifier(secretName);
  return `DROP SECRET IF EXISTS ${escapedName}`;
}

interface IcebergAttachOptions {
  warehouseName: string;
  catalogAlias: string;
  /** REST catalog endpoint URL (mutually exclusive with endpointType) */
  endpoint?: string;
  /** Managed endpoint type (mutually exclusive with endpoint) */
  endpointType?: 'GLUE' | 'S3_TABLES';
  secretName: string;
  useCorsProxy?: boolean;
}

/**
 * Builds an ATTACH statement for an Iceberg REST catalog.
 *
 * ENDPOINT and ENDPOINT_TYPE are mutually exclusive:
 * - Use ENDPOINT for generic REST catalog URLs
 * - Use ENDPOINT_TYPE for managed services (GLUE, S3_TABLES)
 */
export function buildIcebergAttachQuery(options: IcebergAttachOptions): string {
  const { warehouseName, catalogAlias, endpoint, endpointType, secretName, useCorsProxy } = options;

  const escapedAlias = toDuckDBIdentifier(catalogAlias);
  const escapedWarehouse = quote(warehouseName, { single: true });
  const escapedSecretName = toDuckDBIdentifier(secretName);

  const attachParts: string[] = [];
  attachParts.push('TYPE ICEBERG');

  if (endpointType) {
    // Managed service — use ENDPOINT_TYPE
    attachParts.push(`ENDPOINT_TYPE ${quote(endpointType, { single: true })}`);
  } else if (endpoint) {
    // Generic REST catalog — use ENDPOINT
    let finalEndpoint = endpoint;
    if (useCorsProxy && isRemoteUrl(endpoint)) {
      finalEndpoint = wrapWithCorsProxyPathBased(endpoint);
    }
    attachParts.push(`ENDPOINT ${quote(finalEndpoint, { single: true })}`);
  }

  attachParts.push(`SECRET ${escapedSecretName}`);

  return `ATTACH ${escapedWarehouse} AS ${escapedAlias} (\n  ${attachParts.join(',\n  ')}\n)`;
}
