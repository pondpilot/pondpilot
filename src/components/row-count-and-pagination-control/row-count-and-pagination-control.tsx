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
   * If True, the entire pagination control is disabled
   */
  isDisabled: boolean;
  /**
   * If True, the previous page button is enabled
   */
  hasPrevPage: boolean;
  /**
   * If True, the next page button is enabled
   */
  hasNextPage: boolean;
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
  hasPrevPage,
  hasNextPage,
}: PaginationControlProps) => {
  const rowsWording = rowCount > 1 ? 'rows' : 'row';
  const rangeText =
    rowFrom === rowTo
      ? `${formatNumber(rowFrom)}`
      : `${formatNumber(rowFrom)}-${formatNumber(rowTo)}`;
  const outOf =
    rowCount > 0
      ? !isSinglePage
        ? `${rangeText} out of ${formatNumber(rowCount)}${isEstimatedRowCount ? '+' : ''} ${rowsWording}`
        : `${formatNumber(rowCount)} ${rowsWording}`
      : '0 rows';
  return (
    <Group
      bg="background-primary"
      className="h-11 rounded-full  px-4 py-2 shadow-xl shadow-transparentBrandBlue-008 dark:shadow-transparentBrandBlue-008 border border-borderLight-light dark:border-borderLight-dark"
      c="text-secondary"
      justify="space-between"
    >
      <Group className="text-sm" data-testid={setDataTestId('pagination-control-out-of')}>
        {outOf}
      </Group>
      {!isSinglePage && (
        <Group gap={0}>
          <ActionIcon onClick={onPrevPage} disabled={!hasPrevPage || isDisabled}>
            <IconChevronLeft />
          </ActionIcon>
          <ActionIcon onClick={onNextPage} disabled={!hasNextPage || isDisabled}>
            <IconChevronRight />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
};
