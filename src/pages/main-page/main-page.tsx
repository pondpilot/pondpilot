import { Stack, useMantineColorScheme } from '@mantine/core';
import { Allotment } from 'allotment';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useAppStore } from '@store/app-store';
import { TabsPane } from '@features/tabs-pane';
import { TabView } from '@features/tab-view/tab-view';
import { StartGuide } from '@components/start-guide';
import { useImportSQLFiles } from '@hooks/use-import-sql-files';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { Navbar } from './components';

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { importSQLFiles } = useImportSQLFiles();
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();
  const { colorScheme } = useMantineColorScheme();
  const [layoutSizes, setOuterLayoutSizes] = useLocalStorage<number[]>({ key: 'layout-sizes' });
  const tabs = useAppStore.use.tabs();

  const handleAddScript = () => {
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
        handleAddScript();
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
        <Stack className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark gap-0">
          <div className="flex-shrink-0">
            <TabsPane />
          </div>
          <div className="flex-1 min-h-0">
            <TabView />
          </div>
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
