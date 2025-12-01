import { useDatabaseConnectionPool } from '@features/database-context';
import { useIsTauri } from '@hooks/use-is-tauri';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useExtensionManagementStore } from '@store/extension-management';
import { IconDownload, IconExternalLink, IconSearch, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

export const ExtensionSettings = () => {
  const isTauri = useIsTauri();
  const connectionPool = useDatabaseConnectionPool();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);

  const {
    extensions,
    isLoading,
    error,
    loadExtensions,
    installExtension,
    uninstallExtension,
    toggleDisabled,
  } = useExtensionManagementStore();

  useEffect(() => {
    if (isTauri) {
      // Load extensions even if connectionPool is not ready yet
      // This will show the list of available extensions
      loadExtensions(connectionPool);
    }
  }, [isTauri, connectionPool, loadExtensions]);

  if (!isTauri) {
    return null;
  }

  const filteredExtensions = extensions.filter(
    (ext) =>
      ext.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      (ext.description &&
        ext.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase())),
  );

  const requiredExtensions = filteredExtensions.filter((ext) => ext.required);
  const coreExtensions = filteredExtensions.filter((ext) => ext.type === 'core' && !ext.required);
  const communityExtensions = filteredExtensions.filter((ext) => ext.type === 'community');

  const handleInstall = async (name: string) => {
    if (connectionPool) {
      await installExtension(connectionPool, name);
    }
  };

  const handleUninstall = async (name: string) => {
    if (connectionPool) {
      await uninstallExtension(connectionPool, name);
    }
  };

  const handleToggleDisabled = (name: string, disabled: boolean) => {
    toggleDisabled(name, disabled);
  };

  return (
    <Stack>
      {error && (
        <Card bg="red.9" p="sm">
          <Text c="white" size="sm">
            {error}
          </Text>
        </Card>
      )}

      <TextInput
        placeholder="Search extensions..."
        leftSection={<IconSearch size={16} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.currentTarget.value)}
      />

      <ScrollArea h={500}>
        <Stack>
          {requiredExtensions.length > 0 && (
            <Stack>
              <Box>
                <Title order={4} c="text-primary">
                  Required Extensions
                </Title>
                <Text size="sm" c="text-secondary">
                  These extensions are essential for PondPilot to function properly and cannot be
                  disabled.
                </Text>
              </Box>
              <Stack gap="xs">
                {requiredExtensions.map((extension) => (
                  <ExtensionCard
                    key={extension.name}
                    extension={extension}
                    isLoading={isLoading}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onToggleDisabled={handleToggleDisabled}
                  />
                ))}
              </Stack>
            </Stack>
          )}

          {coreExtensions.length > 0 && (
            <Stack>
              <Title order={4} c="text-primary">
                Core Extensions
              </Title>
              <Stack gap="xs">
                {coreExtensions.map((extension) => (
                  <ExtensionCard
                    key={extension.name}
                    extension={extension}
                    isLoading={isLoading}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onToggleDisabled={handleToggleDisabled}
                  />
                ))}
              </Stack>
            </Stack>
          )}

          {communityExtensions.length > 0 && (
            <Stack>
              <Title order={4} c="text-primary">
                Community Extensions
              </Title>
              <Stack gap="xs">
                {communityExtensions.map((extension) => (
                  <ExtensionCard
                    key={extension.name}
                    extension={extension}
                    isLoading={isLoading}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onToggleDisabled={handleToggleDisabled}
                  />
                ))}
              </Stack>
            </Stack>
          )}

          {filteredExtensions.length === 0 && (
            <Text c="text-secondary" ta="center" py="lg">
              No extensions found matching your search.
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
};

interface ExtensionCardProps {
  extension: any;
  isLoading: boolean;
  onInstall: (name: string) => Promise<void>;
  onUninstall: (name: string) => Promise<void>;
  onToggleDisabled: (name: string, disabled: boolean) => void;
}

const ExtensionCard = ({
  extension,
  isLoading,
  onInstall,
  onUninstall,
  onToggleDisabled,
}: ExtensionCardProps) => {
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    await onInstall(extension.name);
    setInstalling(false);
  };

  const handleUninstall = async () => {
    setUninstalling(true);
    await onUninstall(extension.name);
    setUninstalling(false);
  };

  return (
    <Card withBorder p="sm">
      <Group justify="space-between">
        <Box flex={1}>
          <Group gap="xs">
            <Text fw={500}>{extension.name}</Text>
            <Badge size="xs" variant="light" color={extension.type === 'core' ? 'blue' : 'grape'}>
              {extension.type}
            </Badge>
            {extension.installed && (
              <Badge
                size="xs"
                variant={extension.disabled ? 'light' : 'filled'}
                color={extension.disabled ? 'gray' : 'green'}
              >
                {extension.disabled ? 'Disabled' : 'Active'}
              </Badge>
            )}
          </Group>
          {extension.description && (
            <Text size="sm" c="text-secondary">
              {extension.description}
            </Text>
          )}
          {extension.repository && (
            <Group gap="xs" mt={4}>
              <ActionIcon
                size="xs"
                variant="subtle"
                component="a"
                href={extension.repository}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconExternalLink size={14} />
              </ActionIcon>
              <Text size="xs" c="dimmed">
                View repository
              </Text>
            </Group>
          )}
        </Box>

        <Group gap="sm">
          {extension.installed && !extension.required && (
            <Tooltip
              label={
                extension.disabled
                  ? 'Enable this extension'
                  : 'Disable this extension (keeps it installed)'
              }
            >
              <Checkbox
                checked={!extension.disabled}
                onChange={(e) => onToggleDisabled(extension.name, !e.currentTarget.checked)}
                disabled={isLoading}
                label="Enabled"
              />
            </Tooltip>
          )}

          {extension.required && (
            <Badge size="sm" variant="filled" color="blue">
              Always Active
            </Badge>
          )}

          {!extension.installed && !extension.required ? (
            <Button
              size="xs"
              leftSection={installing ? <Loader size={14} /> : <IconDownload size={14} />}
              onClick={handleInstall}
              disabled={isLoading || installing}
              variant="light"
            >
              Install
            </Button>
          ) : (
            !extension.required && (
              <Tooltip label="Uninstall extension">
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={handleUninstall}
                  disabled={isLoading || uninstalling}
                  loading={uninstalling}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            )
          )}
        </Group>
      </Group>
    </Card>
  );
};
