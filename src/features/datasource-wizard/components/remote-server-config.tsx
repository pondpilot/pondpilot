import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';
import { useState } from 'react';

import { QuackConfig } from './quack-config';
import { RemoteDatabaseConfig } from './remote-database-config';

interface RemoteServerConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

type RemoteServerKind = 's3-compatible' | 'quack';

export function RemoteServerConfig({ pool, onBack, onClose }: RemoteServerConfigProps) {
  const [kind, setKind] = useState<RemoteServerKind>('s3-compatible');

  return (
    <Stack gap={16}>
      <Stack gap={8} className="px-4">
        <Text size="sm" c="text-secondary">
          Connect to remote DuckDB-compatible storage or a live DuckDB server
        </Text>
        <SegmentedControl
          value={kind}
          onChange={(value) => setKind(value as RemoteServerKind)}
          data={[
            { label: 'Files & URLs', value: 's3-compatible' },
            { label: 'Quack', value: 'quack' },
          ]}
          data-testid={setDataTestId('remote-server-kind-selector')}
        />
      </Stack>

      {kind === 's3-compatible' ? (
        <RemoteDatabaseConfig onBack={onBack} onClose={onClose} pool={pool} />
      ) : (
        <QuackConfig onBack={onBack} onClose={onClose} pool={pool} />
      )}
    </Stack>
  );
}
