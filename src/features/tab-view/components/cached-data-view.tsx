import { Table } from '@components/table/table';
import { Affix, Stack, Text } from '@mantine/core';
import { DataViewCacheItem } from '@models/data-view';

// This is a degenerate version of Data View that is only showing cached data
// and does not allow any interaction with it. It is necessary for one scenario:
// when app is restarted and a script tab is open that has cached stale data.

export const CachedDataView = ({ cachedData }: { cachedData: DataViewCacheItem }) => {
  return (
    <Stack className="gap-0 h-full overflow-hidden">
      <Affix
        position={{ top: 16, left: '50%' }}
        style={{ transform: 'translateX(-50%)' }}
        zIndex={50}
      >
        <Text c="text-primary" className="text-2xl font-medium">
          Showing stale data. Run the query to see current data.
        </Text>
      </Affix>

      <div className="flex-1 min-h-0 overflow-auto px-3 custom-scroll-hidden pb-6">
        <Table
          data={cachedData.data}
          schema={cachedData.schema}
          sort={null}
          page={cachedData.dataPage}
          visible={false}
          onColumnSelectChange={() => {}}
          onSort={() => {}}
          onRowSelectChange={() => {}}
          onCellSelectChange={() => {}}
          onSelectedColsCopy={() => {}}
        />
      </div>
    </Stack>
  );
};
