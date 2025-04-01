import { Group, ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { memo } from 'react';
import { formatNumber } from '@utils/helpers';

interface PaginationControlProps {
  currentPage: number;
  limit: number;
  rowCount: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const PaginationControl = ({
  onNextPage,
  onPrevPage,
  currentPage,
  limit,
  rowCount,
}: PaginationControlProps) => {
  const isSinglePage = rowCount <= limit;
  const startItem = rowCount > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endItem = Math.min(currentPage * limit, rowCount);
  const outOf =
    rowCount > 0
      ? !isSinglePage
        ? `${formatNumber(startItem)}-${formatNumber(endItem)} out of ${formatNumber(rowCount)}`
        : `${formatNumber(rowCount)} rows`
      : '0 rows';
  return (
    <Group
      bg="background-primary"
      className="h-11 rounded-full min-w-40 px-4 py-2 shadow-xl shadow-transparentBrandBlue-008 dark:shadow-transparentBrandBlue-008 border border-borderLight-light dark:border-borderLight-dark"
      c="text-secondary"
      justify="space-between"
    >
      <Group className="text-sm" data-testid={setDataTestId('pagination-control-out-of')}>
        {outOf}
      </Group>
      <Group gap={0}>
        <ActionIcon onClick={onPrevPage}>
          <IconChevronLeft />
        </ActionIcon>
        <ActionIcon onClick={onNextPage}>
          <IconChevronRight />
        </ActionIcon>
      </Group>
    </Group>
  );
};
