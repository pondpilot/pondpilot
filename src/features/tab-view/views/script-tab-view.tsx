import { memo, useCallback, useState } from 'react';
import { Allotment } from 'allotment';
import { ScriptTab } from '@models/tab';
import { QueryEditor } from '@features/query-editor';
import { dbApiProxi } from '@features/app-context/db-worker';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { updateScriptTabEditorPaneHeight, updateTabDataViewLayout } from '@store/app-store';
import { Table as ApacheTable } from 'apache-arrow';

interface ScriptTabViewProps {
  tab: ScriptTab;
  active: boolean;
}

export const ScriptTabView = memo(({ tab, active }: ScriptTabViewProps) => {
  const [isQueryRunning, setQueryRunning] = useState(false);
  const [fetchedData, setFetchedData] = useState<ApacheTable<any> | null>(null);
  const { conn } = useInitializedDuckDBConnection();

  const runScriptQuery = useCallback(
    async (query: string) => {
      setQueryRunning(true);
      const { data } = await dbApiProxi.runQuery({ query, conn });
      setFetchedData(data);
      setQueryRunning(false);
    },
    [conn],
  );

  const setPanelSize = ([editor, table]: number[]) => {
    updateTabDataViewLayout(tab, {
      ...tab.dataViewLayout,
      dataViewPaneHeight: table,
    });
    updateScriptTabEditorPaneHeight(tab, editor);
  };

  return (
    <div className="h-full relative">
      <Allotment
        vertical
        onDragEnd={setPanelSize}
        defaultSizes={[tab.editorPaneHeight, tab.dataViewLayout.dataViewPaneHeight]}
      >
        <Allotment.Pane preferredSize={tab.editorPaneHeight} minSize={200}>
          <QueryEditor
            id={tab.sqlScriptId}
            active={active}
            runScriptQuery={runScriptQuery}
            // TODO: Get rowCount using data view adapter if available
            columnsCount={0}
            // TODO: Get rowCount using data view adapter if available
            rowsCount={0}
          />
        </Allotment.Pane>

        <Allotment.Pane preferredSize={tab.dataViewLayout.dataViewPaneHeight} minSize={120}>
          {/* <DataView  /> */}
          <div></div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
