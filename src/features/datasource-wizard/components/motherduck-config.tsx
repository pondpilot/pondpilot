import { showError, showSuccess } from '@components/app-notifications';
import { commonTextInputClassNames } from '@components/export-options-modal/constants';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { Stack, TextInput, Text, Button, Group, Alert, Select } from '@mantine/core';
import { useInputState } from '@mantine/hooks';
import { MotherDuckDB } from '@models/data-source';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle } from '@tabler/icons-react';
import { addMotherDuckDB } from '@utils/data-source';
import { motherDuckConnectionManager } from '@utils/motherduck-connection';
import { setDataTestId } from '@utils/test-id';
import { useState, useMemo } from 'react';

interface MotherDuckConfigProps {
  onBack: () => void;
  onClose: () => void;
}

export function MotherDuckConfig({ onBack, onClose }: MotherDuckConfigProps) {
  const [token, setToken] = useInputState('');
  const [database, setDatabase] = useInputState('');
  const [comment, setComment] = useInputState('');
  const [availableDatabases, setAvailableDatabases] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const connectionManager = useMemo(() => motherDuckConnectionManager, []);

  const validateToken = (tokenValue: string): boolean => {
    return tokenValue.trim().length > 10;
  };

  const handleTestConnection = async () => {
    if (!token.trim()) {
      showError({
        title: 'Token required',
        message: 'Please enter your MotherDuck access token',
        autoClose: false,
      });
      return;
    }

    if (!validateToken(token)) {
      showError({
        title: 'Invalid token format',
        message: 'Please enter a valid MotherDuck access token',
        autoClose: false,
      });
      return;
    }

    setIsTesting(true);
    try {
      const isValid = await connectionManager.testConnection(token);
      if (isValid) {
        // Try to load available databases
        try {
          const databases = await connectionManager.listDatabases(token);
          setAvailableDatabases(databases);
          showSuccess({
            title: 'Connection successful',
            message: `Connected to MotherDuck. Found ${databases.length} databases.`,
          });
        } catch (dbError) {
          // Connection works but can't list databases - that's OK for basic usage
          showSuccess({
            title: 'Connection successful',
            message: 'Connected to MotherDuck successfully',
          });
        }
      } else {
        showError({
          title: 'Connection failed',
          message:
            'Unable to connect with the provided token. Please check your token and try again.',
          autoClose: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError({
        title: 'Connection error',
        message: `Failed to connect: ${message}`,
        autoClose: false,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAdd = async () => {
    if (!token.trim()) {
      showError({
        title: 'Token required',
        message: 'Please enter your MotherDuck access token',
      });
      return;
    }

    if (!validateToken(token)) {
      showError({
        title: 'Invalid token format',
        message: 'Please enter a valid MotherDuck access token',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Create MotherDuck data source
      const motherDuckDb: MotherDuckDB = addMotherDuckDB(
        token,
        database || undefined,
        comment || undefined,
      );

      // Test the connection first
      const isConnectionValid = await connectionManager.testConnection(motherDuckDb.token);
      if (!isConnectionValid) {
        throw new Error('Connection test failed');
      }

      // Update connection state
      motherDuckDb.connectionState = 'connected';

      // Add to app state
      const { dataSources } = useAppStore.getState();
      const newDataSources = new Map(dataSources);
      newDataSources.set(motherDuckDb.id, motherDuckDb);

      useAppStore.setState(
        { dataSources: newDataSources },
        false,
        'DatasourceWizard/addMotherDuckDatabase',
      );

      // Persist to storage
      const { _iDbConn } = useAppStore.getState();
      if (_iDbConn) {
        await persistPutDataSources(_iDbConn, [motherDuckDb]);
      }

      showSuccess({
        title: 'MotherDuck added',
        message: `Successfully connected to MotherDuck${
          motherDuckDb.database ? ` (database: ${motherDuckDb.database})` : ''
        }`,
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError({
        title: 'Failed to add MotherDuck',
        message: `Error: ${message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Connect to your MotherDuck cloud database
      </Text>

      <Alert
        icon={<IconAlertCircle size={16} />}
        color="background-accent"
        className="text-sm"
        classNames={{ icon: 'mr-1' }}
      >
        You&apos;ll need a MotherDuck access token. Get one from your MotherDuck console at{' '}
        <Text component="span" fw={500}>
          motherduck.com
        </Text>
      </Alert>

      <Stack gap={12}>
        <TextInput
          label="MotherDuck Access Token"
          data-testid={setDataTestId('motherduck-token-input')}
          placeholder="Enter your MotherDuck token..."
          value={token}
          onChange={setToken}
          description="Your MotherDuck access token"
          required
          type="password"
          classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
        />

        {availableDatabases.length > 0 && (
          <Select
            label="Database (Optional)"
            data-testid={setDataTestId('motherduck-database-select')}
            placeholder="Select database or leave empty for default"
            data={availableDatabases}
            value={database}
            onChange={(value) => setDatabase(value || '')}
            description="Choose a specific database or leave empty to use the default"
            clearable
            classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
          />
        )}

        <TextInput
          label="Comment (Optional)"
          data-testid={setDataTestId('motherduck-comment-input')}
          placeholder="My MotherDuck connection"
          value={comment}
          onChange={setComment}
          description="Optional description for this connection"
          classNames={{ ...commonTextInputClassNames, description: 'pl-4 text-sm' }}
        />
      </Stack>

      <Group justify="end" className="mt-4">
        <Button variant="transparent" color="text-secondary" onClick={onBack}>
          Cancel
        </Button>
        <Button
          variant="light"
          color="background-accent"
          onClick={handleTestConnection}
          loading={isTesting}
          disabled={!token.trim() || isLoading}
          data-testid={setDataTestId('test-motherduck-connection-button')}
        >
          Test Connection
        </Button>
        <Button
          onClick={handleAdd}
          loading={isLoading}
          disabled={!token.trim() || isTesting}
          color="background-accent"
          data-testid={setDataTestId('add-motherduck-button')}
        >
          Add MotherDuck
        </Button>
      </Group>
    </Stack>
  );
}
