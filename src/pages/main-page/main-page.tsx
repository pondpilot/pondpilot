import { Stack, useMantineColorScheme } from '@mantine/core';
import { Allotment } from 'allotment';
import { useHotkeys, useLocalStorage } from '@mantine/hooks';
import { Spotlight } from '@mantine/spotlight';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useAppStore } from '@store/app-store';
import { TabsPane } from '@features/tabs-pane';
import { TabView } from '@features/tab-view/tab-view';
import { StartGuide } from '@features/start-guide';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { importSQLFiles } from '@utils/import-script-file';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import React, { useState, useRef } from 'react';
import { Navbar } from './components';

const DropZoneOverlay = ({
  children,
}: {
  onFilesDrop: (e: React.DragEvent<HTMLElement>) => void;
  acceptedFileTypes?: string[];
  children: React.ReactNode;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef(null);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const fileHandles = [];

    for (const item of e.dataTransfer.items) {
      if (item.kind === 'file') {
        try {
          const handle = await item.getAsFileSystemHandle();
          if (handle.kind === 'file') {
            fileHandles.push(handle);
          }
        } catch (error) {
          console.error('Ошибка получения FileSystemFileHandle:', error);
        }
      }
    }
    // Expected array, but got a single file handle
    console.log({
      fileHandles,
    });
  };

  return (
    <div
      ref={dropZoneRef}
      className="relative w-full h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center z-50 border-2 border-dashed border-blue-500 rounded-lg">
          <div className="bg-white/90 dark:bg-gray-800/90 p-6 rounded-lg shadow-lg text-center">
            <svg
              className="w-16 h-16 mx-auto text-blue-500 mb-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
              />
            </svg>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200">Drop files here</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Files will be processed immediately
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const MainPage = () => {
  /**
   * Common hooks
   */
  const { handleAddFile, handleAddFolder, handleFileDrop } = useAddLocalFilesOrFolders();
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
      <Allotment.Pane preferredSize={layoutSizes?.[0]} maxSize={500} minSize={240}>
        <Navbar />
      </Allotment.Pane>
      <Allotment.Pane preferredSize={layoutSizes?.[1]}>
        <DropZoneOverlay onFilesDrop={handleFileDrop}>
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
        </DropZoneOverlay>
      </Allotment.Pane>
    </Allotment>
  );
};
