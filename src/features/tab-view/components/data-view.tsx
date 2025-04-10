import { Table } from '@components/table/table';
import { Group, Text, ActionIcon, Center, Stack, Tooltip } from '@mantine/core';
import { IconClipboardSmile, IconCopy } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { setDataTestId } from '@utils/test-id';
import { formatNumber } from '@utils/helpers';
import { useState } from 'react';
import { ArrowColumn } from '@models/arrow';
import { PaginationControl, TableLoadingOverlay } from '.';
import { useTableExport } from '../hooks/useTableExport';
import { useColumnSummary } from '../hooks';

const PAGE_SIZE = 100;

interface DataViewProps {
  data: Record<string, any>[] | null;
  columns: ArrowColumn[];

  isLoading: boolean;
  isActive: boolean;
  isScriptTab?: boolean;
  initialData?: Record<string, any>[] | undefined;
}

export const DataView = ({ isScriptTab = false, isActive, isLoading, columns }: DataViewProps) => {
  // TODO: take out from the hook
  const { handleCopyToClipboard } = useTableExport();
  const { calculateColumnSummary, columnTotal, isCalculating, isNumericType, resetTotal } =
    useColumnSummary(undefined);

  const [currentPage, setCurrentPage] = useState(0);
  const [displayedData, setDisplayedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);

  const nextPage = () => setCurrentPage((prev) => prev + 1);
  const prevPage = () => setCurrentPage((prev) => Math.max(0, prev - 1));

  const isSinglePage = totalRows <= PAGE_SIZE;

  return (
    <div className="flex flex-col h-full">
      <TableLoadingOverlay
        queryView={isScriptTab}
        onCancel={() => {
          console.warn('Cancel query not implemented');
        }}
        visible={isLoading}
      />

      {!displayedData && !isLoading && isActive && (
        <Center className="h-full font-bold">
          <Stack align="center" c="icon-default" gap={4}>
            <IconClipboardSmile size={32} stroke={1} />
            <Text c="text-secondary">Your query results will be displayed here.</Text>
          </Stack>
        </Center>
      )}

      {displayedData && (
        <>
          {/* Header toolbar */}
          {displayedData && (
            <Group
              justify="space-between"
              className={cn('h-7 mt-4 mb-2 px-3', isScriptTab && 'mt-3')}
            >
              {isScriptTab ? (
                <>
                  <Group>
                    <Text c="text-primary" className="text-sm font-medium cursor-pointer">
                      Result
                    </Text>
                    <Tooltip label="Soon">
                      <Text c="text-secondary" className="text-sm font-medium cursor-not-allowed">
                        Metadata View
                      </Text>
                    </Tooltip>
                  </Group>
                  <Group>
                    <ActionIcon
                      size={16}
                      onClick={() => {
                        // Copy to clipboard functionality would go here
                        console.warn('Copy to clipboard not implemented');
                      }}
                    >
                      <IconCopy />
                    </ActionIcon>
                  </Group>
                </>
              ) : (
                <>
                  <Group>
                    <Text c="text-secondary" className="text-sm font-medium">
                      {columns.length} columns, {formatNumber(totalRows)} rows
                    </Text>
                  </Group>
                  <Group className="h-full px-4">
                    <ActionIcon size={16} onClick={() => handleCopyToClipboard(displayedData)}>
                      <IconCopy />
                    </ActionIcon>
                  </Group>
                </>
              )}
            </Group>
          )}

          {/* Table */}
          <div className={cn('overflow-auto px-3 custom-scroll-hidden pb-6 flex-1')}>
            <Table
              data={displayedData}
              columns={columns}
              sort={undefined}
              page={currentPage}
              visible={!!isActive}
              onSelectedColsCopy={() => console.warn('Copy selected columns not implemented')}
              onColumnSelectChange={() => console.warn('Column select change not implemented')}
              onRowSelectChange={() => console.warn('Row select change not implemented')}
              onCellSelectChange={() => console.warn('Cell select change not implemented')}
              onSort={() => console.warn('Sort functionality not implemented')}
            />
          </div>

          {/* Footer with summary information */}
          {columns.length && (
            <Group
              align="center"
              className="border-t px-2 py-1 border-borderPrimary-light dark:border-borderPrimary-dark"
            >
              <Text c="text-primary" className="text-sm">
                {isNumericType ? 'SUM' : 'COUNT'}: {columnTotal}
              </Text>
            </Group>
          )}
        </>
      )}

      {/* Pagination control */}
      {displayedData && !isSinglePage && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          data-testid={setDataTestId('data-table-pagination-control')}
        >
          <PaginationControl
            currentPage={currentPage}
            limit={PAGE_SIZE}
            rowCount={totalRows}
            onPrevPage={prevPage}
            onNextPage={nextPage}
          />
        </div>
      )}
    </div>
  );
};
