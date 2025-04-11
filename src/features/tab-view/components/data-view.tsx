import { Table } from '@components/table/table';
import { cn } from '@utils/ui/styles';
import { DataAdapterApi } from '@models/data-adapter';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AsyncRecordBatchStreamReader, RecordBatch } from 'apache-arrow';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { getArrowTableSchema } from '@utils/arrow/schema';
import { ArrowColumn } from '@models/arrow';
import { setDataTestId } from '@utils/test-id';
import { TableLoadingOverlay } from './table-loading-overlay';
import { useSort } from '../useSort';
import { PaginationControl } from './pagination-control';

interface DataViewProps {
  isActive: boolean;
  dataAdapterApi: DataAdapterApi;
}

export const DataView = ({ isActive, dataAdapterApi }: DataViewProps) => {
  /**
   * Common hooks
   */
  const { conn } = useInitializedDuckDBConnection();
  const initialized = useRef(false);

  // Common iterator
  const readerRef = useRef<AsyncRecordBatchStreamReader | null>(null);

  const [recordBatch, setRecordBatch] = useState<RecordBatch | undefined>();
  const [isLoading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 100;

  const { sortParams, handleSort } = useSort();

  /**
   * Process a new batch of data
   * Can use either a provided reader or the current ref
   */
  const processNewBatch = async (reader?: AsyncRecordBatchStreamReader) => {
    const activeReader = reader || readerRef.current;
    if (!activeReader) return;

    try {
      setLoading(true);

      const batchResult = await activeReader.next();

      if (batchResult && !batchResult.done) {
        const batchValue = batchResult.value;
        setRecordBatch(batchValue);
      }

      return batchResult;
    } catch (error) {
      console.error('Error');
    } finally {
      setLoading(false);
    }
  };

  // TODO: Think about schema fingerprinting to avoid unnecessary column recalculation
  const tableColumns = useMemo(() => {
    if (recordBatch) {
      return getArrowTableSchema(recordBatch) || [];
    }
    return [];
  }, [recordBatch]);

  const allTableData = useMemo(() => {
    if (recordBatch) {
      return recordBatch.toArray().map((row) => row.toJSON());
    }
    return [];
  }, [recordBatch]);

  const tableData = useMemo(() => {
    const startIndex = currentPage * ITEMS_PER_PAGE;
    return allTableData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [allTableData, currentPage]);

  const totalPages = useMemo(() => Math.ceil(allTableData.length / ITEMS_PER_PAGE), [allTableData]);

  const hasTableData = tableData.length;
  const isSinglePage = tableData.length < ITEMS_PER_PAGE;

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleResetPagination = () => {
    setCurrentPage(0);
  };

  /**
   * Handle sorting - create a new reader with sort parameters
   */
  const handleSortAndGetNewReader = async (sortField: ArrowColumn['name']) => {
    if (!conn || !dataAdapterApi) return;

    try {
      setLoading(true);
      const params = handleSort(sortField);
      const reader = await dataAdapterApi.getReader(conn, params ? [params] : []);

      readerRef.current = reader;

      // Reset pagination when sorting
      handleResetPagination();

      await processNewBatch(reader);
    } catch (error) {
      console.error('Failed to sort data:', error);
      setLoading(false);
    }
  };

  /**
   * Initialize data when component mounts
   */
  useEffect(() => {
    if (!conn || !dataAdapterApi || initialized.current) {
      return;
    }
    initialized.current = true;
    const initializeData = async () => {
      try {
        setLoading(true);
        const reader = await dataAdapterApi.getReader(conn, []);
        readerRef.current = reader;
        processNewBatch(reader);
      } catch (error) {
        setLoading(false);
      }
    };

    initializeData();

    return () => {
      readerRef.current?.cancel();
      readerRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <TableLoadingOverlay
        title="Opening your file, please wait..."
        queryView={false}
        onCancel={() => console.warn('Cancel query not implemented')}
        visible={isLoading}
      />
      {tableData && (
        <div className={cn('overflow-auto px-3 custom-scroll-hidden pb-6 flex-1')}>
          <Table
            data={tableData}
            columns={tableColumns}
            sort={sortParams}
            page={currentPage}
            visible={!!isActive}
            onSelectedColsCopy={() => console.warn('Copy selected columns not implemented')}
            onColumnSelectChange={() => console.warn('Column select change not implemented')}
            onRowSelectChange={() => console.warn('Row select change not implemented')}
            onCellSelectChange={() => console.warn('Cell select change not implemented')}
            onSort={handleSortAndGetNewReader}
          />
        </div>
      )}
      {hasTableData && !isSinglePage && (
        <div
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50"
          data-testid={setDataTestId('data-table-pagination-control')}
        >
          <PaginationControl
            currentPage={currentPage + 1}
            limit={100}
            rowCount={allTableData.length}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        </div>
      )}
    </div>
  );
};
