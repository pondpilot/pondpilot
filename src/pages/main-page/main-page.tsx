import { DataViewErrorFallback } from '@components/error-fallback';
import { useAppContext } from '@features/app-context';
import { DataViewer } from '@features/data-viewer';
import { TabsPane } from '@features/tabs-pane';
import { useFileHandlers } from '@hooks/useUploadFilesHandlers';
import { Stack, useMantineColorScheme } from '@mantine/core';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { Allotment } from 'allotment';
import { ErrorBoundary } from 'react-error-boundary';
import { Navbar } from './components';

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { importSQLFiles, onCreateQueryFile } = useAppContext();
  const { handleAddSource } = useFileHandlers();
  const { colorScheme } = useMantineColorScheme();
  const [layoutSizes, setOuterLayoutSizes] = useLocalStorage<number[]>({ key: 'layout-sizes' });

  /**
   * Handlers
   */
  const handleOuterLayoutResize = (sizes: number[]) => {
    setOuterLayoutSizes(sizes);
  };

  useHotkeys([
    [
      'Ctrl+F',
      () => {
        handleAddSource('file')();
        Spotlight.close();
      },
    ],
    [
      'Ctrl+D',
      () => {
        handleAddSource('file', ['.duckdb'])();
        Spotlight.close();
      },
    ],
    [
      'Ctrl+I',
      () => {
        importSQLFiles();
        Spotlight.close();
      },
    ],
    [
      'Alt+mod+F',
      () => {
        handleAddSource('folder')();
        Spotlight.close();
      },
    ],
    [
      'Alt+N',
      () => {
        onCreateQueryFile({
          entities: [{ name: 'query-name.sql' }],
        });
        Spotlight.close();
      },
    ],
  ]);

  return (
    <>
      <Allotment
        className={colorScheme === 'dark' ? 'custom-allotment-dark' : 'custom-allotment'}
        onDragEnd={handleOuterLayoutResize}
      >
        <Allotment.Pane preferredSize={layoutSizes?.[0]} maxSize={500} minSize={220}>
          <Navbar />
        </Allotment.Pane>
        <Allotment.Pane preferredSize={layoutSizes?.[1]}>
          <Stack
            gap={0}
            className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark"
          >
            <TabsPane />
            <ErrorBoundary FallbackComponent={DataViewErrorFallback}>
              <DataViewer />
            </ErrorBoundary>
          </Stack>
        </Allotment.Pane>
      </Allotment>
    </>
  );
};
