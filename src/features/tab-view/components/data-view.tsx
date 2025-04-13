import { Table } from '@components/table/table';
import { cn } from '@utils/ui/styles';
import { DataAdapterApi } from '@models/data-adapter';
import { useMemo, useRef, useState } from 'react';
import { AsyncRecordBatchStreamReader, RecordBatch } from 'apache-arrow';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { getArrowTableSchema } from '@utils/arrow/schema';
import { ArrowColumn } from '@models/arrow';
import { setDataTestId } from '@utils/test-id';
import { TableLoadingOverlay } from './table-loading-overlay';
import { useSort } from '../useSort';
import { PaginationControl } from './pagination-control';
import { useDidMount } from '@hooks/use-did-mount';
import { ColumnSortSpec } from '@models/db';

const LIMIT = 100;
const OVERSCAN_PAGES = 2;

interface DataViewProps {
  isActive: boolean;
  dataAdapterApi: DataAdapterApi;
}

export const DataView = ({ isActive, dataAdapterApi }: DataViewProps) => {
  /**
   * Common hooks
   */
  const { conn } = useInitializedDuckDBConnection();

  /**
   * Local State
   */
  const readerRef = useRef<AsyncRecordBatchStreamReader | null>(null);
  const [tableBatchData, setTableBatchData] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<ArrowColumn[]>([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [loadedRowCount, setLoadedRowCount] = useState(0);

  const [currentPage, setCurrentPage] = useState(0);

  const [isAllDataLoaded, setIsAllDataLoaded] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoading, setLoading] = useState(false);

  const [visibleRowRange, setVisibleRowRange] = useState<{ rowFrom: number; rowTo: number }>({
    rowFrom: 0,
    rowTo: LIMIT,
  });

  const { sortParams, handleSort } = useSort();

  const hasTableData = tableBatchData.length > 0;

  const totalRowsToConsider = rowCount !== null ? rowCount : loadedRowCount;
  const isSinglePage = totalRowsToConsider < LIMIT;

  // Calculate total pages based on known data
  const totalPages = Math.ceil(totalRowsToConsider / LIMIT);

  const shouldPreloadData = (targetPage: number): boolean => {
    const remainingPages = Math.floor(loadedRowCount / LIMIT) - targetPage;

    return remainingPages <= OVERSCAN_PAGES && !isAllDataLoaded && !isLoadingMore;
  };

  const currentPageData = useMemo(() => {
    const result = [];
    const end = Math.min(visibleRowRange.rowTo, tableBatchData.length);

    for (let i = visibleRowRange.rowFrom; i < end; i++) {
      result.push(tableBatchData[i]);
    }

    return result;
  }, [tableBatchData, visibleRowRange]);

  const handleNextPage = async () => {
    const nextPage = currentPage + 1;

    const nextPageStartRow = nextPage * LIMIT;
    if (nextPageStartRow >= loadedRowCount && !isAllDataLoaded) {
      await loadMoreData();
    }

    // Preload in background
    if (shouldPreloadData(nextPage)) {
      loadMoreData();
    }

    if (nextPage < totalPages) {
      const rowFrom = nextPage * LIMIT;
      const rowTo = rowFrom + LIMIT;
      setVisibleRowRange({ rowFrom, rowTo });
      setCurrentPage(nextPage);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      const prevPage = currentPage - 1;
      const rowFrom = prevPage * LIMIT;
      const rowTo = rowFrom + LIMIT;
      setVisibleRowRange({ rowFrom, rowTo });
      setCurrentPage(prevPage);
    }
  };

  const handleResetPagination = () => {
    setVisibleRowRange({ rowFrom: 0, rowTo: LIMIT });
    setCurrentPage(0);
  };

  const loadMoreData = async () => {
    if (!readerRef.current || isAllDataLoaded || isLoadingMore) {
      return;
    }

    try {
      setIsLoadingMore(true);
      const batchResult = await readerRef.current.next();

      if (batchResult && !batchResult.done) {
        const batchValue = batchResult.value;
        const newTableData = batchValue.toArray().map((row) => row.toJSON());

        // APPEND!
        setTableBatchData((prevData) => [...prevData, ...newTableData]);
        setLoadedRowCount((prevCount) => prevCount + newTableData.length);

        return batchValue;
      } else {
        setIsAllDataLoaded(true);

        if (rowCount === null) {
          setRowCount(loadedRowCount);
        }
      }
    } catch (error) {
      console.error('Failed to load more data:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const getNewReaderAndProcessBatch = async (sortParams?: ColumnSortSpec | null) => {
    try {
      // Reset state for new query
      setLoading(true);
      setTableBatchData([]);
      setLoadedRowCount(0);
      setIsAllDataLoaded(false);

      // Get initial row count if available via API
      const initialRowCount = (await dataAdapterApi.getRowCount?.(conn)) ?? null;
      setRowCount(initialRowCount);
      console.log({
        initialRowCount,
      });

      // Get the reader
      const reader = await dataAdapterApi.getReader(conn, sortParams ? [sortParams] : []);
      readerRef.current = reader;

      // Get first batch
      const batchResult = await reader.next();

      if (batchResult && !batchResult.done) {
        const batchValue = batchResult.value;
        const tableData = batchValue.toArray().map((row) => row.toJSON());
        const hasLoadedColumns = columns.length > 0;

        if (!hasLoadedColumns) {
          const extractedColumns = getArrowTableSchema(batchValue);
          setColumns(extractedColumns);
        }

        setTableBatchData(tableData);
        setLoadedRowCount(tableData.length);

        return batchValue;
      } else {
        setIsAllDataLoaded(true);
        setRowCount(0);
        return null;
      }
    } catch (error) {
      console.error('Failed to get new reader and process batch:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle sorting - create a new reader with sort parameters
   */
  const handleSortAndGetNewReader = async (sortField: ArrowColumn['name']) => {
    const params = handleSort(sortField);
    handleResetPagination();
    getNewReaderAndProcessBatch(params);
  };

  /**
   * Initialize data when component mounts
   */
  useDidMount(() => {
    const init = async () => {
      await getNewReaderAndProcessBatch();
    };
    init();
    return () => {
      readerRef.current?.cancel();
      readerRef.current = null;
    };
  });

  return (
    <div className="flex flex-col h-full">
      <TableLoadingOverlay
        title="Opening your file, please wait..."
        queryView={false}
        onCancel={() => console.warn('Cancel query not implemented')}
        visible={isLoading}
      />
      {hasTableData && (
        <div className={cn('overflow-auto px-3 custom-scroll-hidden pb-6 flex-1')}>
          <Table
            data={currentPageData}
            columns={columns}
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
            limit={LIMIT}
            rowCount={rowCount !== null ? rowCount : loadedRowCount}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            hasMoreData={isAllDataLoaded}
          />
        </div>
      )}
    </div>
  );
};
