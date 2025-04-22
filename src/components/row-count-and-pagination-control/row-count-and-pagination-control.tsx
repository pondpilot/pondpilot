import { Group, ActionIcon, TextInput, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconArrowBarRight } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { formatNumber } from '@utils/helpers';
import { useState } from 'react';
import { MAX_DATA_VIEW_PAGE_SIZE } from '@models/tab';

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
  /**
   * Callback function for jumping to a specific row
   */
  onJumpToRow?: (row: number) => void;
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
  onJumpToRow,
}: PaginationControlProps) => {
  const [rowInput, setRowInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);

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

  // Show go to row UI if there are more than 5 * MAX_DATA_VIEW_PAGE_SIZE rows
  const showGoToRow = rowCount > 5 * MAX_DATA_VIEW_PAGE_SIZE && onJumpToRow && !isSinglePage;
  const isInvalidRowInput = rowInput && (Number.isNaN(Number(rowInput)) || Number(rowInput) < 1);

  const handleRowInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowInput(event.target.value);
  };

  const handleJumpToRow = () => {
    const rowNumber = parseInt(rowInput, 10);
    if (rowNumber > 0 && onJumpToRow) {
      onJumpToRow(rowNumber);
      setRowInput('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleJumpToRow();
    }
  };

  return (
    <Group
      bg="background-primary"
      className="h-11 rounded-full px-4 py-2 shadow-xl shadow-transparentBrandBlue-008 dark:shadow-transparentBrandBlue-008 border border-borderLight-light dark:border-borderLight-dark
      min-w-max-content max-w-full whitespace-nowrap flex-nowrap"
      c="text-secondary"
      justify="space-between"
    >
      <Group
        className="text-sm overflow-hidden text-ellipsis"
        data-testid={setDataTestId('pagination-control-out-of')}
      >
        {outOf}
      </Group>

      {showGoToRow && (
        <Group gap={0} style={{ opacity: isInputFocused ? 1 : 0.7 }} className="flex-nowrap">
          <TextInput
            size="xs"
            placeholder="row..."
            error={isInvalidRowInput}
            value={rowInput}
            onChange={handleRowInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            style={{ width: '80px' }}
            rightSection={
              <Tooltip label="Jump to row">
                <ActionIcon
                  size="xs"
                  disabled={!rowInput || isDisabled}
                  onClick={handleJumpToRow}
                  data-testid={setDataTestId('pagination-control-go-to-row-button')}
                >
                  <IconArrowBarRight size={16} />
                </ActionIcon>
              </Tooltip>
            }
            data-testid={setDataTestId('pagination-control-go-to-row-input')}
          />
        </Group>
      )}
      {!isSinglePage && (
        <Group gap={0} className="flex-nowrap">
          <ActionIcon
            onClick={onPrevPage}
            disabled={!hasPrevPage || isDisabled}
            data-testid={setDataTestId('pagination-control-prev')}
          >
            <IconChevronLeft />
          </ActionIcon>
          <ActionIcon
            onClick={onNextPage}
            disabled={!hasNextPage || isDisabled}
            data-testid={setDataTestId('pagination-control-next')}
          >
            <IconChevronRight />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
};
