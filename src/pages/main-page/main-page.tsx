import { Stack, useMantineColorScheme } from '@mantine/core';
import { Allotment } from 'allotment';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { useImportSQLFiles } from '@store/hooks';
import { useLocalFilesOrFolders } from '@hooks/useLocalFilesOrFolders';
import { createSQLScript, getOrCreateTabFromScript, useAppStore } from '@store/app-store';
import { Navbar } from './components';
import { TabsPane } from '@features/tabs-pane';
import { TabView } from '@features/tab-view/tab-view';
import { StartGuide } from '@components/start-guide';

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { importSQLFiles } = useImportSQLFiles();
  const { handleAddFile, handleAddFolder } = useLocalFilesOrFolders();
  const { colorScheme } = useMantineColorScheme();
  const [layoutSizes, setOuterLayoutSizes] = useLocalStorage<number[]>({ key: 'layout-sizes' });
  const tabs = useAppStore.use.tabs();

  const handleAddQuery = () => {
    const newEmptyScript = createSQLScript();
    getOrCreateTabFromScript(newEmptyScript, true);
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
        <Stack gap={0} className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
          <TabsPane />
          <TabView />
        </Stack>
        {tabs.size > 0 && (
          <div className="h-full">
            <StartGuide />
          </div>
        )}
      </Allotment.Pane>
    </Allotment>
  );
};
