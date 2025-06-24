import { Stack } from '@mantine/core';
import { AnyFileSourceTab, TabId } from '@models/tab';
import { useTabReactiveState } from '@store/app-store';
import { memo } from 'react';

import { DataView, DataViewInfoPane } from '../components';
import { useDataAdapter } from '../hooks/use-data-adapter';

interface FileDataSourceTabViewProps {
  tabId: TabId;
  active: boolean;
}

export const FileDataSourceTabView = memo(({ tabId, active }: FileDataSourceTabViewProps) => {
  // Get the reactive portion of tab state
  const tab = useTabReactiveState<AnyFileSourceTab>(tabId, 'data-source');

  // Get the data adapter
  const dataAdapter = useDataAdapter({ tab, sourceVersion: 0 });

  return (
    <Stack className="gap-0 h-full relative">
      <DataViewInfoPane dataAdapter={dataAdapter} tabType={tab.type} tabId={tab.id} />
      <DataView active={active} dataAdapter={dataAdapter} tabId={tab.id} tabType={tab.type} />
    </Stack>
  );
});
