import { Stack, Group, Title } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { PropsWithChildren, useState, useCallback } from 'react';

const isFileDragEvent = (e: React.DragEvent<HTMLDivElement>) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

interface DndOverlayProps extends PropsWithChildren {
  handleFileDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

export const DndOverlay = ({ children, handleFileDrop }: DndOverlayProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) {
      return;
    }
    e.preventDefault();
    const nextTarget = e.relatedTarget as Node | null;
    if (!nextTarget || !e.currentTarget.contains(nextTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) {
      return;
    }
    e.preventDefault();
    setIsDragging(false);
    handleFileDrop(e);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn('relative h-full w-full z-50')}
      data-testid={setDataTestId('dnd-overlay')}
    >
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <Stack
            align="center"
            className="rounded-xl px-8 py-4 bg-white dark:bg-backgroundPrimary-dark"
          >
            <Group>
              <IconUpload className="text-iconDefault-light dark:text-iconDefault-dark" />
              <Title c="text-primary" order={2}>
                Drop your files here!
              </Title>
            </Group>
            <Title order={4} c="text-secondary" size="sm" className="text-center">
              Accepted file types: csv, xlsx, json, parquet, tsv, sqlnb
            </Title>
          </Stack>
        </div>
      )}
      <div className={cn('h-full w-full', isDragging && 'blur-sm')}>{children}</div>
    </div>
  );
};
