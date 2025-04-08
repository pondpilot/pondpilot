import { useMantineColorScheme } from '@mantine/core';
import { Allotment } from 'allotment';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { ContentView } from '@features/content-view';
import { useImportSQLFiles } from '@store/hooks';
import { useLocalFilesOrFolders } from '@hooks/useLocalFilesOrFolders';
import { createSQLScript, getOrCreateTabFromScript, setActiveTabId } from '@store/init-store';
import { Navbar } from './components';

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { importSQLFiles } = useImportSQLFiles();
  const { handleAddFile, handleAddFolder } = useLocalFilesOrFolders();
  const { colorScheme } = useMantineColorScheme();
  const [layoutSizes, setOuterLayoutSizes] = useLocalStorage<number[]>({ key: 'layout-sizes' });

  const handleAddQuery = () => {
    const newEmptyScript = createSQLScript();
    const newTab = getOrCreateTabFromScript(newEmptyScript);
    setActiveTabId(newTab.id);
  };

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
        handleAddFile();
        Spotlight.close();
      },
    ],
    [
      'Ctrl+D',
      () => {
        handleAddFile(['.duckdb']);
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
        handleAddFolder();
        Spotlight.close();
      },
    ],
    [
      'Alt+N',
      () => {
        handleAddQuery();
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
