import { useMantineColorScheme } from '@mantine/core';
import { Allotment } from 'allotment';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { useUploadFileHandles } from '@hooks/useUploadFileHandles';
import { ContentView } from '@features/content-view';
import { useCreateQueryFileMutation } from '@store/app-idb-store';
import { useImportSQLFiles } from '@store/hooks';
import { Navbar } from './components';

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { importSQLFiles } = useImportSQLFiles();
  const { handleAddSource } = useUploadFileHandles();
  const { colorScheme } = useMantineColorScheme();
  const [layoutSizes, setOuterLayoutSizes] = useLocalStorage<number[]>({ key: 'layout-sizes' });
  const { mutateAsync: createQueryFile } = useCreateQueryFileMutation();

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
        createQueryFile({
          name: 'query.sql',
        });
        Spotlight.close();
      },
    ],
  ]);

  return (
    <Allotment
      className={colorScheme === 'dark' ? 'custom-allotment-dark' : 'custom-allotment'}
      onDragEnd={handleOuterLayoutResize}
    >
      <Allotment.Pane preferredSize={layoutSizes?.[0]} maxSize={500} minSize={220}>
        <Navbar />
      </Allotment.Pane>
      <Allotment.Pane preferredSize={layoutSizes?.[1]}>
        <ContentView />
      </Allotment.Pane>
    </Allotment>
  );
};
