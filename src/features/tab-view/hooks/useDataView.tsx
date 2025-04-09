import { useState, useEffect, useMemo, useRef } from 'react';
import { Table as ApacheTable, AsyncRecordBatchStreamReader } from 'apache-arrow';
import { getDataViewAdapter } from '@controllers/db/data-view';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { FileDataSourceTab } from '@models/tab';
import { useInitStore } from '@store/init-store';

export const useDataView = (tab: FileDataSourceTab) => {
  const dataViewReader = useRef<AsyncRecordBatchStreamReader<any> | null>(null);
  const [fetchedData, setFetchedData] = useState<ApacheTable<any> | null>(null);
  const [isQueryRunning, setQueryRunning] = useState<boolean>(false);

  const { conn } = useInitializedDuckDBConnection();
  const dataView = useInitStore((state) => state.dataViews.get(tab.dataViewId));

  const dataViewAdapter = useMemo(
    () => (dataView ? getDataViewAdapter(dataView) : null),
    [dataView],
  );

  // Create a new reader on first load. The rest should be updated on sorting etc.
  // TODO: Effect fires twice bc of strict mode (reader.next();)
  useEffect(() => {
    if (!dataViewAdapter || !conn || dataViewReader.current) {
      return;
    }

    (async () => {
      const reader = await dataViewAdapter.getReader(conn, []);
      setQueryRunning(true);

      // Fetch the first batch
      const batch = await reader.next();

      if (batch.value) {
        setFetchedData(batch.value as ApacheTable<any>);
        setQueryRunning(false);
      }

      dataViewReader.current = reader;
    })();
  }, [dataViewAdapter, conn]);

  return {
    fetchedData,
    isQueryRunning,
    dataViewReader,
  };
};
