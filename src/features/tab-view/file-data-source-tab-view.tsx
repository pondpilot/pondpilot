import { memo, useEffect, useMemo, useState } from 'react';
import { Allotment } from 'allotment';
import { FileDataSourceTab } from '@models/tab';
import { updateTabDataViewLayout, useInitStore } from '@store/init-store';
import { getFlatFileDataAdapterApi } from '@controllers/db/data-view';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { AsyncRecordBatchStreamReader, RecordBatch } from 'apache-arrow';
import { getArrowTableSchema } from '@utils/arrow/schema';
import { DataView } from './components/data-view';
import { TableLoadingOverlay } from './components';

interface FileDataSourceTabViewProps {
  tab: FileDataSourceTab;
  active: boolean;
}

export const FileDataSourceTabView = memo(({ tab, active }: FileDataSourceTabViewProps) => {
  const { conn } = useInitializedDuckDBConnection();
  const cache = useInitStore((state) => state.dataViewCache);
  const dataSource = useInitStore((state) => state.dataSources.get(tab.dataSourceId));
  const sourceFile = useInitStore((state) =>
    dataSource?.fileSourceId ? state.localEntries.get(dataSource?.fileSourceId) : null,
  );
  const dataViewAdapter = useMemo(() => {
    if (dataSource && dataSource.type !== 'attached-db' && sourceFile) {
      return getFlatFileDataAdapterApi(dataSource, tab.id, sourceFile);
    }
    return null;
  }, [dataSource, sourceFile, tab.id]);

  const cachedData = dataViewAdapter?.getCacheKey && cache.get(dataViewAdapter.getCacheKey());

  const [reader, setReader] = useState<AsyncRecordBatchStreamReader | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<any[]>(cachedData?.data || []);
  const [columns, setColumns] = useState<any[]>(cachedData?.columns || []);

  const fetchData = async () => {
    if (!reader) {
      return;
    }
    setIsLoading(true);
    try {
      const batch = await reader.next();
      const batchValue: RecordBatch = batch.value;

      if (batchValue) {
        const hasColumns = columns.length;

        const tableData = batchValue.toArray().map((row) => row.toJSON());
        const tableColumns = (hasColumns ? columns : getArrowTableSchema(batchValue)) || [];

        setData((prevData) => [...prevData, ...tableData]);
        setColumns(tableColumns);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!dataViewAdapter || !conn || reader) {
      return;
    }
    const createReader = async () => {
      // here we can show the loader and not render the table
      const _reader = await dataViewAdapter.getReader(conn, []);
      setReader(_reader);
    };
    createReader();
  }, [dataViewAdapter, conn]);

  useEffect(() => {
    if (!reader) return;
    fetchData();
  }, [reader]);

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
          {dataViewAdapter && (
            <div>
              <TableLoadingOverlay
                title="Opening your file, please wait..."
                queryView={false}
                onCancel={() => console.warn('Cancel query not implemented')}
                visible={isLoading}
              />
              <DataView
                data={data}
                columns={columns}
                isActive={active}
                isScriptTab={false}
                isLoading={isLoading}
              />
            </div>
          )}
        </Allotment.Pane>
      </Allotment>
    </div>
  );
});
