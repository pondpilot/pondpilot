import { ConnectionPool } from '@engines/types';
import { Text } from '@mantine/core';
import { SecretType } from '@models/secrets';

import { DatabaseConnectionForm } from './shared/database-connection-form';

interface PostgresConfigProps {
  pool: ConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

const SSL_MODES = [
  { value: 'disable', label: 'Disable' },
  { value: 'allow', label: 'Allow' },
  { value: 'prefer', label: 'Prefer (default)' },
  { value: 'require', label: 'Require' },
  { value: 'verify-ca', label: 'Verify CA' },
  { value: 'verify-full', label: 'Verify Full' },
];

export function PostgresConfig({ pool, onBack, onClose }: PostgresConfigProps) {
  return (
    <DatabaseConnectionForm
      pool={pool}
      databaseType="postgres"
      defaultPort={5432}
      secretType={SecretType.Postgres}
      displayName="PostgreSQL"
      description="Connect to a PostgreSQL database using stored credentials"
      sslModes={SSL_MODES}
      onBack={onBack}
      onClose={onClose}
      alertMessage={
        <Text size="sm">
          PostgreSQL connections use DuckDB&apos;s postgres_scanner extension to query external
          databases. Requires desktop app for direct database connections.
        </Text>
      }
    />
  );
}
