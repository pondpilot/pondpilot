import { ConnectionPool } from '@engines/types';
import { SecretType } from '@models/secrets';
import { Text } from '@mantine/core';

import { DatabaseConnectionForm } from './shared/database-connection-form';

interface MySQLConfigProps {
  pool: ConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

export function MySQLConfig({ pool, onBack, onClose }: MySQLConfigProps) {
  return (
    <DatabaseConnectionForm
      pool={pool}
      databaseType="mysql"
      defaultPort={3306}
      secretType={SecretType.MySQL}
      displayName="MySQL"
      description="Connect to a MySQL database using stored credentials"
      onBack={onBack}
      onClose={onClose}
      alertMessage={
        <Text size="sm">
          MySQL connections use DuckDB&apos;s mysql_scanner extension to query external databases.
          Requires desktop app for direct database connections.
        </Text>
      }
    />
  );
}
