import { showError } from '@components/app-notifications';
import { ConnectionPool } from '@engines/types';
import { Button, Group, Loader, Stack, Text, ScrollArea, Checkbox, Alert } from '@mantine/core';
import { useInputState, useDisclosure } from '@mantine/hooks';
import { useAppStore } from '@store/app-store';
import { IconInfoCircle } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { isMotherDuckUrl } from '@utils/url-helpers';
import { useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { MotherDuckSecretSelector } from './motherduck-secret-selector';
import { useMotherDuckConfig } from '../hooks/use-motherduck-config';

interface MotherDuckDatabaseConfigProps {
  pool: ConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

function MotherDuckDatabaseConfigInner({ pool, onBack, onClose }: MotherDuckDatabaseConfigProps) {
  const {
    dbs,
    selectedSet,
    setSelectedSet,
    loading,
    attachLoading,
    selectedSecretId,
    setSelectedSecretId,
    selectedSecretName,
    setSelectedSecretName,
    loadMotherDuckList,
    handleAttach: handleAttachInternal,
    getConnectedDbNamesForInstance,
  } = useMotherDuckConfig(pool);

  const [_selectedDb, setSelectedDb] = useInputState('');
  const [_createTokenModalOpened, { open: _openCreateToken, close: _closeCreateToken }] =
    useDisclosure(false);

  // Check if there's already a MotherDuck connection - do this immediately
  const checkExistingMotherDuck = () => {
    const { dataSources } = useAppStore.getState();
    for (const ds of dataSources.values()) {
      if (ds.type === 'remote-db' && isMotherDuckUrl(ds.url)) {
        return { exists: true, name: ds.instanceName || 'MotherDuck' };
      }
    }
    return { exists: false, name: '' };
  };

  const existingCheck = checkExistingMotherDuck();
  const [hasExistingMotherDuck] = useState(existingCheck.exists);
  const [existingInstanceName] = useState(existingCheck.name);
  const [showConfirmDialog, setShowConfirmDialog] = useState(existingCheck.exists);
  const [isRestarting, setIsRestarting] = useState(false);

  const isAttachDisabled = useMemo(
    () => !selectedSecretId || selectedSet.size === 0 || attachLoading || loading,
    [selectedSecretId, selectedSet, attachLoading, loading],
  );

  const handleAttach = async () => {
    const success = await handleAttachInternal();
    if (success) {
      onClose();
    }
  };

  const handleDisconnectAndRestart = async () => {
    setIsRestarting(true);

    // Remove all MotherDuck data sources
    const { dataSources, _persistenceAdapter, _iDbConn } = useAppStore.getState();
    const { persistDeleteDataSource } = await import('@controllers/data-source/persist');

    const motherDuckIds: any[] = [];
    for (const [id, ds] of dataSources) {
      if (ds.type === 'remote-db' && isMotherDuckUrl(ds.url)) {
        motherDuckIds.push(id);
      }
    }

    // Remove from persistence
    const persistTarget = _persistenceAdapter || _iDbConn;
    if (persistTarget && motherDuckIds.length > 0) {
      try {
        await persistDeleteDataSource(persistTarget, motherDuckIds, []);
      } catch (e) {
        console.error('Failed to remove MotherDuck from persistence:', e);
      }
    }

    // Remove from store
    const newDataSources = new Map(dataSources);
    for (const id of motherDuckIds) {
      newDataSources.delete(id);
    }
    useAppStore.setState({ dataSources: newDataSources }, false, 'MotherDuck/disconnect');

    // Reload the app to get a fresh start with clean DuckDB state
    window.location.reload();
  };

  // If we're in the process of restarting, show a loading state
  if (isRestarting) {
    return (
      <Stack gap={16} align="center" className="py-8">
        <Loader size="lg" />
        <Text size="sm" c="text-secondary">
          Disconnecting existing MotherDuck connection and restarting...
        </Text>
      </Stack>
    );
  }

  // If there's an existing connection, show the confirmation content inline
  if (hasExistingMotherDuck && showConfirmDialog) {
    return (
      <Stack gap={16}>
        <Alert icon={<IconInfoCircle size={16} />} color="blue">
          <Text size="sm">
            You currently have a MotherDuck connection active for{' '}
            <strong>{existingInstanceName}</strong>.
          </Text>
        </Alert>

        <Text size="sm">
          Due to how DuckDB manages MotherDuck authentication, only one MotherDuck account can be
          connected at a time. To connect to a different account, we need to:
        </Text>

        <Stack gap={8} className="pl-4">
          <Text size="sm">1. Disconnect the current MotherDuck connection</Text>
          <Text size="sm">2. Restart the application to clear the authentication state</Text>
          <Text size="sm">3. Allow you to connect to the new account after restart</Text>
        </Stack>

        <Text size="sm" c="text-secondary">
          This is a technical limitation that ensures your MotherDuck credentials are properly
          isolated between accounts.
        </Text>

        <Group justify="end" mt="md">
          <Button
            variant="default"
            onClick={() => {
              setShowConfirmDialog(false);
              onBack();
            }}
          >
            Cancel
          </Button>
          <Button
            color="blue"
            onClick={() => {
              setShowConfirmDialog(false);
              handleDisconnectAndRestart();
            }}
          >
            Continue and Restart
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      <Text size="sm" c="text-secondary" className="pl-4">
        Select a saved MotherDuck token, then choose databases to attach
      </Text>

      <MotherDuckSecretSelector
        selectedSecretId={selectedSecretId}
        onSecretSelect={(id, name) => {
          setSelectedSecretId(id);
          setSelectedSecretName(name);
        }}
        onCreateNew={() => {
          // Navigate to secrets manager or open create token modal
          showError({
            title: 'Create token',
            message: 'Please create a MotherDuck token in the Secrets Manager first',
          });
        }}
      />

      <Stack gap={12}>
        <Group>
          <Button
            variant="light"
            color="background-accent"
            onClick={loadMotherDuckList}
            loading={loading}
            disabled={!selectedSecretId}
          >
            {loading ? 'Refreshing…' : 'Refresh list'}
          </Button>
          {loading && <Loader size="sm" />}
        </Group>
        <Text size="sm" c="text-secondary" className="pl-4">
          Select databases to attach (already connected ones are disabled)
        </Text>
        <ScrollArea h={200} offsetScrollbars>
          <Stack gap={6} className="pl-4 pr-2">
            {dbs.length === 0 && !loading && <Text size="sm">No databases found</Text>}
            {(() => {
              const connectedForThisInstance = getConnectedDbNamesForInstance(
                selectedSecretId || undefined,
                selectedSecretName,
              );
              return dbs.map((name) => {
                const disabled = connectedForThisInstance.has(name);
                const checked = selectedSet.has(name) && !disabled;
                return (
                  <Checkbox
                    key={name}
                    label={name}
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selectedSet);
                      if (e.currentTarget.checked) next.add(name);
                      else next.delete(name);
                      setSelectedSet(next);
                      setSelectedDb(name);
                    }}
                    disabled={disabled}
                  />
                );
              });
            })()}
          </Stack>
        </ScrollArea>
      </Stack>

      <Group justify="end" className="mt-4">
        <Button variant="transparent" color="text-secondary" onClick={onBack}>
          Cancel
        </Button>
        <Button
          onClick={handleAttach}
          loading={attachLoading}
          disabled={isAttachDisabled}
          color="background-accent"
          data-testid={setDataTestId('attach-motherduck-database-button')}
        >
          Attach Database
        </Button>
      </Group>
    </Stack>
  );
}

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <Stack gap={16} className="p-4">
      <Text size="sm" c="red">
        An error occurred while configuring MotherDuck databases
      </Text>
      <Text size="xs" c="text-secondary">
        {error.message}
      </Text>
      <Button onClick={resetErrorBoundary} variant="light" size="sm">
        Try Again
      </Button>
    </Stack>
  );
}

export function MotherDuckDatabaseConfig(props: MotherDuckDatabaseConfigProps) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <MotherDuckDatabaseConfigInner {...props} />
    </ErrorBoundary>
  );
}
