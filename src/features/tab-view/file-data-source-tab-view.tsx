import { memo } from 'react';
import { Allotment } from 'allotment';
import { FileDataSourceTab } from '@models/tab';
import { updateTabDataViewLayout } from '@store/init-store';
import { DataResultView } from './data-result-view';
import { useDataView } from './hooks/useDataView';

interface FileDataSourceTabViewProps {
  tab: FileDataSourceTab;
  active: boolean;
}

export const FileDataSourceTabView = memo(({ tab, active }: FileDataSourceTabViewProps) => {
  const setPanelSize = ([_, table]: number[]) => {
    updateTabDataViewLayout(tab, {
      ...tab.dataViewLayout,
      dataViewPaneHeight: table,
    });
  };
  const { fetchedData, isQueryRunning } = useDataView(tab);

  return (
    <div className="h-full relative">
      <Allotment
        vertical
        onDragEnd={setPanelSize}
        defaultSizes={[0, tab.dataViewLayout.dataViewPaneHeight]}
      >
        <Allotment.Pane preferredSize={tab.dataViewLayout.dataViewPaneHeight} minSize={120}>
          <DataResultView data={fetchedData} isLoading={isQueryRunning} active={active} />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
