import { memo, useMemo } from 'react';
import { Allotment } from 'allotment';
import { FileDataSourceTab } from '@models/tab';
import { updateTabDataViewLayout, useAppStore } from '@store/app-store';
import { getFlatFileDataAdapterApi } from '@controllers/db/data-view';
import { DataView } from './components/data-view';

interface FileDataSourceTabViewProps {
  tab: FileDataSourceTab;
  active: boolean;
}

export const FileDataSourceTabView = memo(({ tab, active }: FileDataSourceTabViewProps) => {
  const dataSource = useAppStore((state) => state.dataSources.get(tab.dataSourceId));
  const sourceFile = useAppStore((state) =>
    dataSource?.fileSourceId ? state.localEntries.get(dataSource?.fileSourceId) : null,
  );
  const dataViewAdapter = useMemo(() => {
    if (dataSource && dataSource.type !== 'attached-db' && sourceFile) {
      return getFlatFileDataAdapterApi(dataSource, tab.id, sourceFile);
    }
    return null;
  }, [dataSource, sourceFile, tab.id]);

  return (
    <div className="h-full relative">
      <Allotment
        vertical
        onDragEnd={([_, table]: number[]) => {
          updateTabDataViewLayout(tab, {
            ...tab.dataViewLayout,
            dataViewPaneHeight: table,
          });
        }}
        defaultSizes={[0, tab.dataViewLayout.dataViewPaneHeight]}
      >
        <Allotment.Pane preferredSize={tab.dataViewLayout.dataViewPaneHeight} minSize={120}>
          {dataViewAdapter && <DataView isActive={active} dataAdapterApi={dataViewAdapter} />}
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
