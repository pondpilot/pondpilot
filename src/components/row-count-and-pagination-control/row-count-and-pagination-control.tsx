import { Group, ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { formatNumber } from '@utils/helpers';

interface PaginationControlProps {
  rowFrom: number;
  rowTo: number;
  /**
   * If True, no pagination control buttons are shown
   */
  isSinglePage: boolean;
  rowCount: number;
  /**
   * If True, the row count is assumed as an estimate
   * and a '+' is appended to the row count
   */
  isEstimatedRowCount: boolean;
  /**
   * Indicates if the pagination control buttons should show as disabled
   */
  isDisabled: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const RowCountAndPaginationControl = ({
  rowFrom,
  rowTo,
  isSinglePage,
  rowCount,
  isEstimatedRowCount,
  isDisabled,
  onPrevPage,
  onNextPage,
}: PaginationControlProps) => {
  const outOf =
    rowCount > 0
      ? !isSinglePage
        ? `${formatNumber(rowFrom)}-${formatNumber(rowTo)} out of ${formatNumber(rowCount)}${isEstimatedRowCount ? '+' : ''} rows`
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
      {!isSinglePage && (
        <Group gap={0}>
          <ActionIcon onClick={onPrevPage} disabled={isDisabled}>
            <IconChevronLeft />
          </ActionIcon>
          <ActionIcon onClick={onNextPage} disabled={isDisabled}>
            <IconChevronRight />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
};
