import { Center, Stack, Text } from '@mantine/core';
import { NotebookTab, TabId } from '@models/tab';
import { useAppStore, useTabReactiveState } from '@store/app-store';
import { IconNotebook } from '@tabler/icons-react';
import { memo } from 'react';

interface NotebookTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const NotebookTabView = memo(({ tabId, active: _active }: NotebookTabViewProps) => {
  const tab = useTabReactiveState<NotebookTab>(tabId, 'notebook');
  const notebook = useAppStore((state) => state.notebooks.get(tab.notebookId));

  if (!notebook) {
    return (
      <Center className="h-full">
        <Text c="dimmed">Notebook not found</Text>
      </Center>
    );
  }

  return (
    <Center className="h-full">
      <Stack align="center" gap="sm">
        <IconNotebook size={48} stroke={1.5} opacity={0.5} />
        <Text fw={500} size="lg">
          {notebook.name}
        </Text>
        <Text c="dimmed" size="sm">
          {notebook.cells.length} {notebook.cells.length === 1 ? 'cell' : 'cells'}
        </Text>
      </Stack>
    </Center>
  );
});

NotebookTabView.displayName = 'NotebookTabView';
