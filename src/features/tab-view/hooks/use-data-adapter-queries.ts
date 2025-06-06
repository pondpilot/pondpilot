import { useInitializedDuckDBConnectionPool } from '@features/duckdb-context/duckdb-context';
import { DataAdapterQueries } from '@models/data-adapter';
import { AnyTab, TabReactiveState } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { getFileDataAdapterQueries, getScriptAdapterQueries } from '@utils/data-adapter';
import { assertNeverValueType } from '@utils/typing';
import { useMemo } from 'react';

type UseDataAdapterQueriesRetType = DataAdapterQueries & {
  userErrors: string[];
  internalErrors: string[];
};

type UseDataAdapterQueriesProps = {
  tab: TabReactiveState<AnyTab>;
  /**
   * Whenever this changes, adapter will force update internal version,
   * even if the data source appears the same. E.g. tail queries of scripts
   * can match exactly, but should force a new data version.
   */
  sourceVersion: number;
};

export const useDataAdapterQueries = ({
  tab,
  sourceVersion,
}: UseDataAdapterQueriesProps): UseDataAdapterQueriesRetType => {
  // Get pool
  const pool = useInitializedDuckDBConnectionPool();

  // We are getting various state values baesd on tab type that is then
  // passed to our pure utility functions that create actual query functions
  const dataSourceId = tab.type === 'data-source' ? tab.dataSourceId : undefined;

  // Get the data source and source file from the store
  const dataSource = useAppStore((state) =>
    dataSourceId ? state.dataSources.get(dataSourceId) : undefined,
  );

  const sourceFile = useAppStore((state) =>
    dataSource && 'fileSourceId' in dataSource
      ? state.localEntries.get(dataSource.fileSourceId)
      : undefined,
  );

  const ret = useMemo((): UseDataAdapterQueriesRetType => {
    switch (tab.type) {
      case 'data-source': {
        const { adapter, userErrors, internalErrors } = getFileDataAdapterQueries({
          pool,
          dataSource,
          tab,
          sourceFile,
        });

        return {
          ...adapter,
          userErrors,
          internalErrors,
        };
      }
      case 'script': {
        const { adapter, userErrors, internalErrors } = getScriptAdapterQueries({
          pool,
          tab,
        });

        return {
          ...adapter,
          userErrors,
          internalErrors,
        };
      }
      case 'schema-browser': {
        // Schema browser doesn't need a data adapter - return empty adapter
        return {
          userErrors: [],
          internalErrors: [],
        };
      }
      default:
        assertNeverValueType(tab);
        return {
          userErrors: [],
          // @ts-expect-error
          internalErrors: [`Unknown tab type: ${tab.type}`],
        };
    }
    // we need sourceVersion to be a dependency, because it allows us to re-create the queries
    // when the script is re-executed, even if the data source is "the same"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pool, dataSource, sourceFile, sourceVersion]);

  return ret;
};
