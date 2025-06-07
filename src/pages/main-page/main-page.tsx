import { Stack, useMantineColorScheme } from '@mantine/core';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { Allotment } from 'allotment';

import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { StartGuide } from '@features/start-guide';
import { TabView } from '@features/tab-view/tab-view';
import { TabsPane } from '@features/tabs-pane';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { useAppStore } from '@store/app-store';
import { importSQLFiles } from '@utils/import-script-file';

import { Navbar } from './components';

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();
  const { colorScheme } = useMantineColorScheme();
  const [layoutSizes, setOuterLayoutSizes] = useLocalStorage<number[]>({
    key: LOCAL_STORAGE_KEYS.MAIN_LAYOUT_DIMENSIONS,
  });

  const tabCount = useAppStore((state) => state.tabs.size);
  const hasTabs = tabCount > 0;

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
      'Ctrl+Alt+N',
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
      <Allotment.Pane preferredSize={layoutSizes?.[0]} maxSize={500} minSize={240}>
        <Navbar />
      </Allotment.Pane>
      <Allotment.Pane preferredSize={layoutSizes?.[1]}>
        {hasTabs && (
          <Stack className="h-full bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark gap-0">
            <div className="flex-shrink-0">
              <TabsPane />
            </div>
            <div className="flex-1 min-h-0">
              <TabView />
            </div>
          </Stack>
        )}

        {!hasTabs && (
          <div className="h-full">
            <StartGuide />
          </div>
        )}
      </Allotment.Pane>
    </Allotment>
  );
};
