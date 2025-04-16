import { memo, useCallback, useState } from 'react';
import { Allotment } from 'allotment';
import { ScriptTab } from '@models/tab';
import { QueryEditor } from '@features/query-editor';
import { DataView } from '@features/tab-view/components/data-view';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { DataAdapterApi } from '@models/data-adapter';
import { getArrowTableSchema } from '@utils/arrow/schema';
import { updateScriptTabEditorPaneHeight, updateTabDataViewLayout } from '@controllers/tab';

interface ScriptTabViewProps {
  tab: ScriptTab;
  active: boolean;
}

export const ScriptTabView = memo(({ tab, active }: ScriptTabViewProps) => {
  const [dataAdapter, setDataAdapter] = useState<DataAdapterApi | null>(null);
  const conn = useInitializedDuckDBConnection();

  const runScriptQuery = useCallback(
    async (query: string) => {
      // setQueryRunning(true);
      // const { data } = await runQueryDeprecated({ query, conn });
      setDataAdapter({
        getSchema: async () => {
          // TODO: find more performant way to get schema
          const result = await conn.query(`SELECT * FROM (${query}) LIMIT 0`);
          return getArrowTableSchema(result);
        },
        getReader: async (sort) => {
          let fullQuery = query;

          if (sort.length > 0) {
            const orderBy = sort.map((s) => `${s.column} ${s.order || 'asc'}`).join(', ');
            fullQuery = `
              SELECT * FROM (${query}) ORDER BY ${orderBy}`;
          }
          const reader = await conn.send(fullQuery, true);
          return reader;
        },
      });
      // setQueryRunning(false);
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
          <QueryEditor id={tab.sqlScriptId} active={active} runScriptQuery={runScriptQuery} />
        </Allotment.Pane>

        <Allotment.Pane preferredSize={tab.dataViewLayout.dataViewPaneHeight} minSize={120}>
          {dataAdapter ? (
            <DataView visible={active} cacheKey={tab.id} dataAdapterApi={dataAdapter} />
          ) : null}
          <div></div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
