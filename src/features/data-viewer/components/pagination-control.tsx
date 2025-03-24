import { Group, ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { memo } from 'react';

interface PaginationControlProps {
  isSinglePage: boolean;
  outOf: string;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const PaginationControl = memo(
  ({ outOf, isSinglePage, onNextPage, onPrevPage }: PaginationControlProps) => (
    <Group
      bg="background-primary"
      className="h-11 rounded-full min-w-40 px-4 py-2 shadow-xl shadow-transparentBrandBlue-008 dark:shadow-transparentBrandBlue-008 border border-borderLight-light dark:border-borderLight-dark"
      c="text-secondary"
      justify={isSinglePage ? 'center' : 'space-between'}
    >
      <Group className="text-sm">{outOf}</Group>
      {!isSinglePage && (
        <Group gap={0}>
          <ActionIcon onClick={onPrevPage}>
            <IconChevronLeft />
          </ActionIcon>
          <ActionIcon onClick={onNextPage}>
            <IconChevronRight />
          </ActionIcon>
        </Group>
      )}
    </Group>
  ),
  (prevProps, nextProps) => prevProps.outOf === nextProps.outOf,
);

PaginationControl.displayName = 'PaginationControl';
