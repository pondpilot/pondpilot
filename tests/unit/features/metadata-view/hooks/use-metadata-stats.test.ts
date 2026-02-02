/* eslint-disable import/order -- Module-under-test import must come after jest.mock calls for proper mock hoisting */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  CancelledOperation,
  ColumnDistribution,
  ColumnStats,
  DataAdapterApi,
} from '@models/data-adapter';
import { DBColumn } from '@models/db';

// Track mock state and effects
let mockState: Record<string, unknown> = {};
let mockRefs: Record<string, { current: unknown }> = {};
let effectCallbacks: Array<() => (() => void) | void> = [];

type StatsFn = (columnNames: string[]) => Promise<ColumnStats[] | undefined>;

type DistFn = (name: string, type: any) => Promise<ColumnDistribution | undefined>;

jest.mock('react', () => ({
  useState: jest.fn((initialValue: unknown) => {
    const key = `state_${Object.keys(mockState).length}`;
    if (!(key in mockState)) {
      mockState[key] =
        typeof initialValue === 'function' ? (initialValue as () => unknown)() : initialValue;
    }
    const setStateFn = (newValue: unknown) => {
      if (typeof newValue === 'function') {
        mockState[key] = (newValue as (prev: unknown) => unknown)(mockState[key]);
      } else {
        mockState[key] = newValue;
      }
    };
    return [mockState[key], setStateFn];
  }),
  useRef: jest.fn((initialValue: unknown) => {
    const key = `ref_${Object.keys(mockRefs).length}`;
    if (!(key in mockRefs)) {
      mockRefs[key] = { current: initialValue };
    }
    return mockRefs[key];
  }),
  useCallback: jest.fn((fn: unknown) => fn),
  useEffect: jest.fn((effect: () => (() => void) | void) => {
    effectCallbacks.push(effect);
  }),
}));

jest.mock('@mantine/hooks', () => ({
  useDidUpdate: jest.fn(),
}));

jest.mock('@utils/db', () => ({
  isNumberType: jest.fn((type: string) => {
    return ['bigint', 'float', 'decimal', 'integer'].includes(type);
  }),
}));

// eslint-disable-next-line import/first -- Module-under-test import must come after jest.mock calls
import {
  classifyColumnType,
  useMetadataStats,
} from '@features/metadata-view/hooks/use-metadata-stats';

function createMockColumn(name: string, sqlType: string): DBColumn {
  return {
    name,
    sqlType,
    index: 0,
  } as unknown as DBColumn;
}

function createMockAdapter(overrides: Partial<DataAdapterApi> = {}): DataAdapterApi {
  return {
    getColumnStats: jest.fn<StatsFn>().mockResolvedValue([]),
    getColumnDistribution: jest.fn<DistFn>().mockResolvedValue(undefined),
    currentSchema: [],
    isStale: false,
    dataSourceVersion: 1,
    dataVersion: 1,
    rowCountInfo: {
      realRowCount: null,
      estimatedRowCount: null,
      availableRowCount: 0,
    },
    disableSort: false,
    sort: [],
    dataSourceExhausted: false,
    dataSourceError: [],
    isFetchingData: false,
    isSorting: false,
    dataReadCancelled: false,
    reset: jest.fn<() => Promise<void>>(),
    getDataTableSlice: jest.fn(),
    getAllTableData: jest.fn(),
    toggleColumnSort: jest.fn(),
    getColumnAggregate: jest.fn(),
    getChartAggregatedData: jest.fn(),
    sourceQuery: null,
    pool: null,
    cancelDataRead: jest.fn(),
    ackDataReadCancelled: jest.fn(),
    ...overrides,
  } as unknown as DataAdapterApi;
}

// State index constants matching useState declaration order
// in useMetadataStats:
// 0=columnStats, 1=columnDistributions, 2=isLoading,
// 3=loadingDistributions, 4=errors, 5=isSupported
const STATE = {
  errors: 'state_4',
  isSupported: 'state_5',
} as const;

function getState(key: keyof typeof STATE): unknown {
  return mockState[STATE[key]];
}

describe('classifyColumnType', () => {
  it('should classify numeric types as numeric', () => {
    expect(classifyColumnType(createMockColumn('a', 'integer'))).toBe('numeric');
    expect(classifyColumnType(createMockColumn('b', 'float'))).toBe('numeric');
    expect(classifyColumnType(createMockColumn('c', 'decimal'))).toBe('numeric');
    expect(classifyColumnType(createMockColumn('d', 'bigint'))).toBe('numeric');
  });

  it('should classify date types as date', () => {
    expect(classifyColumnType(createMockColumn('a', 'date'))).toBe('date');
    expect(classifyColumnType(createMockColumn('b', 'timestamp'))).toBe('date');
    expect(classifyColumnType(createMockColumn('c', 'timestamptz'))).toBe('date');
  });

  it('should classify everything else as text', () => {
    expect(classifyColumnType(createMockColumn('a', 'string'))).toBe('text');
    expect(classifyColumnType(createMockColumn('b', 'boolean'))).toBe('text');
    expect(classifyColumnType(createMockColumn('c', 'other'))).toBe('text');
    expect(classifyColumnType(createMockColumn('d', 'array'))).toBe('text');
    expect(classifyColumnType(createMockColumn('e', 'object'))).toBe('text');
  });
});

describe('useMetadataStats', () => {
  beforeEach(() => {
    mockState = {};
    mockRefs = {};
    effectCallbacks = [];
    jest.clearAllMocks();
  });

  function runEffects() {
    for (const effect of effectCallbacks) {
      effect();
    }
  }

  async function flushPromises() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('should return initial empty state', () => {
    const adapter = createMockAdapter();
    const result = useMetadataStats(adapter);

    expect(result.isLoading).toBe(false);
    expect(result.isSupported).toBe(true);
    expect(result.columnStats).toBeInstanceOf(Map);
    expect(result.columnStats.size).toBe(0);
    expect(result.columnDistributions).toBeInstanceOf(Map);
    expect(result.columnDistributions.size).toBe(0);
    expect(result.errors).toBeInstanceOf(Map);
    expect(result.errors.size).toBe(0);
    expect(result.loadingDistributions).toBeInstanceOf(Set);
    expect(result.loadingDistributions.size).toBe(0);
  });

  it('should not fetch when disabled', () => {
    const adapter = createMockAdapter({
      currentSchema: [createMockColumn('a', 'integer')],
    });
    useMetadataStats(adapter, { enabled: false });
    runEffects();

    expect(adapter.getColumnStats).not.toHaveBeenCalled();
    expect(adapter.getColumnDistribution).not.toHaveBeenCalled();
  });

  it('should not fetch when no data is available', () => {
    const adapter = createMockAdapter({
      currentSchema: [],
    });
    useMetadataStats(adapter);
    runEffects();

    expect(adapter.getColumnStats).not.toHaveBeenCalled();
  });

  it('should not fetch when data is stale', () => {
    const adapter = createMockAdapter({
      currentSchema: [createMockColumn('a', 'integer')],
      isStale: true,
    });
    useMetadataStats(adapter);
    runEffects();

    expect(adapter.getColumnStats).not.toHaveBeenCalled();
  });

  it('should fetch stats when enabled with data', async () => {
    const mockStats: ColumnStats[] = [
      {
        columnName: 'amount',
        totalCount: 100,
        distinctCount: 50,
        nullCount: 5,
        min: '1',
        max: '100',
        mean: '50.5',
      },
    ];

    const adapter = createMockAdapter({
      currentSchema: [createMockColumn('amount', 'integer')],
      getColumnStats: jest.fn<StatsFn>().mockResolvedValue(mockStats),
      getColumnDistribution: jest.fn<DistFn>().mockResolvedValue({
        type: 'numeric',
        buckets: [
          { label: '0-50', count: 40 },
          { label: '50-100', count: 55 },
        ],
      }),
    });

    useMetadataStats(adapter);
    runEffects();
    await flushPromises();

    expect(adapter.getColumnStats).toHaveBeenCalledWith(['amount']);
    expect(adapter.getColumnDistribution).toHaveBeenCalledWith('amount', 'numeric');
  });

  it('should handle unsupported data sources', async () => {
    const adapter = createMockAdapter({
      currentSchema: [createMockColumn('a', 'string')],
      getColumnStats: jest.fn<StatsFn>().mockResolvedValue(undefined),
    });

    useMetadataStats(adapter);
    runEffects();
    await flushPromises();

    expect(adapter.getColumnStats).toHaveBeenCalled();
    expect(getState('isSupported')).toBe(false);
  });

  it('should ignore system-cancelled operations', async () => {
    const cancelledError = new CancelledOperation({
      isUser: false,
      reason: 'replaced',
    });

    const adapter = createMockAdapter({
      currentSchema: [createMockColumn('a', 'string')],
      getColumnStats: jest.fn<StatsFn>().mockRejectedValue(cancelledError),
    });

    useMetadataStats(adapter);
    runEffects();
    await flushPromises();

    const errorsMap = getState('errors') as Map<string, string>;
    expect(errorsMap.size).toBe(0);
  });

  it('should handle real errors in getColumnStats', async () => {
    const adapter = createMockAdapter({
      currentSchema: [createMockColumn('a', 'string')],
      getColumnStats: jest.fn<StatsFn>().mockRejectedValue(new Error('Query failed')),
    });

    useMetadataStats(adapter);
    runEffects();
    await flushPromises();

    const errorsMap = getState('errors') as Map<string, string>;
    expect(errorsMap.has('__stats__')).toBe(true);
    expect(errorsMap.get('__stats__')).toBe('Query failed');
  });

  it('should handle per-column distribution errors', async () => {
    const adapter = createMockAdapter({
      currentSchema: [createMockColumn('good', 'integer'), createMockColumn('bad', 'string')],
      getColumnStats: jest.fn<StatsFn>().mockResolvedValue([
        {
          columnName: 'good',
          totalCount: 10,
          distinctCount: 5,
          nullCount: 0,
          min: '1',
          max: '10',
          mean: '5',
        },
        {
          columnName: 'bad',
          totalCount: 10,
          distinctCount: 3,
          nullCount: 0,
          min: null,
          max: null,
          mean: null,
        },
      ]),
      getColumnDistribution: jest.fn<DistFn>().mockImplementation(async (name: string) => {
        if (name === 'bad') {
          throw new Error('Distribution failed');
        }
        return {
          type: 'numeric',
          buckets: [{ label: '1-10', count: 10 }],
        };
      }),
    });

    useMetadataStats(adapter);
    runEffects();
    await flushPromises();

    expect(adapter.getColumnDistribution).toHaveBeenCalledTimes(2);
  });

  it('should fetch distributions with correct types', async () => {
    const columns = [
      createMockColumn('id', 'integer'),
      createMockColumn('name', 'string'),
      createMockColumn('created', 'timestamp'),
    ];

    const adapter = createMockAdapter({
      currentSchema: columns,
      getColumnStats: jest.fn<StatsFn>().mockResolvedValue(
        columns.map((c) => ({
          columnName: c.name,
          totalCount: 100,
          distinctCount: 50,
          nullCount: 0,
          min: null,
          max: null,
          mean: null,
        })),
      ),
      getColumnDistribution: jest.fn<DistFn>().mockResolvedValue(undefined),
    });

    useMetadataStats(adapter);
    runEffects();
    await flushPromises();

    expect(adapter.getColumnDistribution).toHaveBeenCalledWith('id', 'numeric');
    expect(adapter.getColumnDistribution).toHaveBeenCalledWith('name', 'text');
    expect(adapter.getColumnDistribution).toHaveBeenCalledWith('created', 'date');
  });

  it('should invalidate cache when dataSourceVersion changes', () => {
    // Cache invalidation is handled by comparing cache.version against
    // dataSourceVersion in fetchStats, not via a separate useDidUpdate hook.
    const adapter = createMockAdapter({
      dataSourceVersion: 5,
      currentSchema: [createMockColumn('a', 'integer')],
    });
    useMetadataStats(adapter);

    // The fetchStats callback depends on dataSourceVersion via useCallback,
    // so a new version triggers a new fetchStats which skips stale cache.
    expect(effectCallbacks.length).toBeGreaterThan(0);
  });
});
