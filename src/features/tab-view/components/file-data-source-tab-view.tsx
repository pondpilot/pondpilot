import { memo, useEffect, useState } from 'react';
import { AnyFileSourceTab } from '@models/tab';
import { useAppStore, useDataSourceObjectSchema } from '@store/app-store';
import { getFileDataAdapterApi } from '@controllers/db/tab';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { DataAdapterApi } from '@models/data-adapter';
import { LoadingOverlay } from '@components/loading-overlay';
import { Loader, Stack, Text } from '@mantine/core';
import { DataView, DataViewInfoPane } from '.';

interface FileDataSourceTabViewProps {
  tab: AnyFileSourceTab;
  visible: boolean;
}

export const FileDataSourceTabView = memo(({ tab, visible }: FileDataSourceTabViewProps) => {
  const conn = useInitializedDuckDBConnection();
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [dataAdapter, setDataAdapter] = useState<DataAdapterApi | null>(null);

  // Get the data source and source file from the store
  const dataSource = useAppStore((state) => state.dataSources.get(tab.dataSourceId));

  if (!dataSource) {
    throw new Error(
      `Tried opening a tab with a data source that doesn't exist: ${tab.dataSourceId}`,
    );
  }

  const sourceFile = useAppStore((state) => state.localEntries.get(dataSource.fileSourceId));

  if (!sourceFile) {
    throw new Error(
      `Tried opening a tab with for a data source (${dataSource.id}) with invalid source file reference: ${dataSource.fileSourceId}`,
    );
  }

  let schemaName: string | undefined;
  let objectName: string | undefined;
  if (tab.type === 'data-source' && tab.dataSourceType === 'db') {
    schemaName = tab.schemaName;
    objectName = tab.objectName;
  }

  const schema = useDataSourceObjectSchema(dataSource, schemaName, objectName);

  // Now determine in which state are we. We can be in one of the following states:
  // 1. Loading: we are creating a data adapter (which is usually instant, but can fail or take time)
  // 2. Loaded: we have a data adapter and it is ready to be used
  // 3. Error: we enciunterd an error while creating the data adapter
  const isLoading = !dataAdapter && loadErrors.length === 0;
  const isError = loadErrors.length > 0;

  useEffect(() => {
    const { adapter, userErrors, internalErrors } = getFileDataAdapterApi(
      conn,
      dataSource,
      schema,
      tab,
      sourceFile,
    );

    setDataAdapter(adapter);

    // Log internal errors to the console and add one user facing error
    // to the load errors
    if (internalErrors.length > 0) {
      console.group('Error creating data adapter for tab id:', tab.id);
      internalErrors.forEach((error) => console.error(error));
      console.groupEnd();
      loadErrors.push('Internal error creating data adapter. Please report this issue.');
    }

    // It should be an error to miss the adapter and have no user errors. Either the adapter
    // was created or we should enforce some error
    if (!adapter && userErrors.length === 0) {
      loadErrors.push('Internal error creating data adapter. Please report this issue.');
    }

    setLoadErrors(userErrors);
  }, [conn, dataSource, tab, sourceFile]);

  return (
    <Stack className="gap-0 h-full relative">
      <LoadingOverlay visible={isLoading || isError}>
        <Stack align="center" gap={4} bg="background-primary" className="p-8 pt-4 rounded-2xl">
          <Loader size={24} color="text-secondary" />
          {isError && (
            <Text c="text-primary" className="text-2xl font-medium">
              We are sorry, but we encountered an errors while opening your file:
              {loadErrors.map((error, index) => (
                <Text key={index} c="text-secondary" className="text-lg font-medium">
                  - {error}
                </Text>
              ))}
            </Text>
          )}
          {isLoading && (
            <Text c="text-primary" className="text-2xl font-medium">
              Opening your file, please wait...
            </Text>
          )}
        </Stack>
      </LoadingOverlay>

      {!isLoading && !isError && dataAdapter && (
        <>
          <DataViewInfoPane tab={tab} dataAdapterApi={dataAdapter} />
          <DataView visible={visible} cacheKey={tab.id} dataAdapterApi={dataAdapter} />
        </>
      )}
    </Stack>
  );
});
