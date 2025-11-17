import { isTauriEnvironment } from '@utils/browser';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DuckDBExtension {
  name: string;
  description: string;
  type: 'core' | 'community';
  required?: boolean; // If true, extension is essential and can't be disabled/uninstalled
  installed: boolean;
  disabled: boolean; // If true, extension is installed but won't load
  version?: string;
  repository?: string;
}

interface ExtensionManagementState {
  extensions: DuckDBExtension[];
  isLoading: boolean;
  error: string | null;
  loadExtensions: (pool: any) => Promise<void>;
  installExtension: (pool: any, name: string) => Promise<void>;
  uninstallExtension: (pool: any, name: string) => Promise<void>;
  toggleDisabled: (name: string, disabled: boolean) => void;
  getActiveExtensions: () => DuckDBExtension[]; // Returns installed and not disabled
}

// Essential extensions that are always loaded and can't be disabled
// Note: motherduck is only available in Tauri (desktop) and is excluded on web/wasm
const REQUIRED_EXTENSIONS: Omit<DuckDBExtension, 'installed' | 'disabled'>[] = [
  {
    name: 'parquet',
    description: 'Essential for reading and writing Parquet files',
    type: 'core',
    required: true,
  },
  {
    name: 'json',
    description: 'Essential for JSON data processing',
    type: 'core',
    required: true,
  },
  {
    name: 'excel',
    description: 'Essential for Excel file support',
    type: 'core',
    required: true,
  },
  {
    name: 'httpfs',
    description: 'Essential for reading files from URLs',
    type: 'core',
    required: true,
  },
  {
    name: 'read_stat',
    description: 'Essential for reading SAS, Stata, and SPSS statistical data files',
    type: 'community',
    required: true,
  },
  {
    name: 'sqlite_scanner',
    description: 'Essential for reading and writing SQLite database files',
    type: 'core',
    required: true,
  },
  {
    name: 'postgres_scanner',
    description: 'Adds support for connecting to a Postgres database',
    type: 'core',
    required: true,
  },
  {
    name: 'mysql_scanner',
    description: 'Adds support for connecting to a MySQL database',
    type: 'core',
    required: true,
  },
];

// Conditionally include motherduck in required extensions for Tauri only
const REQUIRED_EXTENSIONS_WITH_ENV: Omit<DuckDBExtension, 'installed' | 'disabled'>[] = (() => {
  const base = [...REQUIRED_EXTENSIONS];
  if (isTauriEnvironment()) {
    base.splice(4, 0, {
      name: 'motherduck',
      description: 'Essential for MotherDuck connections (md: URLs)',
      type: 'core',
      required: true,
    });
  }
  return base;
})();

// Optional core extensions (from duckdb_extensions())
const CORE_EXTENSIONS: Omit<DuckDBExtension, 'installed' | 'disabled'>[] = [
  {
    name: 'arrow',
    description: 'A zero-copy data integration between Apache Arrow and DuckDB',
    type: 'core',
  },
  {
    name: 'autocomplete',
    description: 'Adds support for autocomplete in the shell',
    type: 'core',
  },
  {
    name: 'avro',
    description: 'Adds support for reading and writing Avro files',
    type: 'core',
  },
  {
    name: 'aws',
    description: 'Provides features that depend on the AWS SDK',
    type: 'core',
  },
  {
    name: 'azure',
    description: 'Adds a filesystem abstraction for Azure blob storage to DuckDB',
    type: 'core',
  },
  {
    name: 'delta',
    description: 'Adds support for Delta Lake',
    type: 'core',
  },
  {
    name: 'fts',
    description: 'Adds support for Full-Text Search Indexes',
    type: 'core',
  },
  {
    name: 'iceberg',
    description: 'Adds support for Apache Iceberg',
    type: 'core',
  },
  {
    name: 'icu',
    description: 'Adds support for time zones and collations using the ICU library',
    type: 'core',
  },
  {
    name: 'inet',
    description: 'Adds support for IP-related data types and functions',
    type: 'core',
  },
  {
    name: 'jemalloc',
    description: 'Overwrites system allocator with JEMalloc',
    type: 'core',
  },
  {
    name: 'shell',
    description: 'Adds CLI-specific support and functionalities',
    type: 'core',
  },
  {
    name: 'spatial',
    description:
      'Geospatial extension that adds support for working with spatial data and functions',
    type: 'core',
  },
  {
    name: 'tpcds',
    description: 'Adds TPC-DS data generation and query support',
    type: 'core',
  },
  {
    name: 'tpch',
    description: 'Adds TPC-H data generation and query support',
    type: 'core',
  },
  {
    name: 'vss',
    description: 'Adds indexing support to accelerate Vector Similarity Search',
    type: 'core',
  },
];

// Community extensions (from duckdb.org/community_extensions)
// Note: Extensions that are also in core (like arrow, httpserver) are excluded from this list
const COMMUNITY_EXTENSIONS: Omit<DuckDBExtension, 'installed' | 'disabled'>[] = [
  {
    name: 'bigquery',
    description:
      'Integrates DuckDB with Google BigQuery, allowing direct querying and management of datasets',
    type: 'community',
  },
  {
    name: 'blockduck',
    description: 'Live SQL Queries on Blockchain',
    type: 'community',
  },
  {
    name: 'cache_httpfs',
    description: 'Read cached filesystem for httpfs',
    type: 'community',
  },
  {
    name: 'chsql',
    description: 'ClickHouse SQL Macros for DuckDB',
    type: 'community',
  },
  {
    name: 'chsql_native',
    description: 'ClickHouse Native Client & File Reader for chsql',
    type: 'community',
  },
  {
    name: 'cronjob',
    description: 'DuckDB HTTP Cronjob Extension',
    type: 'community',
  },
  {
    name: 'crypto',
    description: 'Cryptographic hash functions and HMAC',
    type: 'community',
  },
  {
    name: 'datasketches',
    description: 'Compute approximate distinct item counts and quantile estimations',
    type: 'community',
  },
  {
    name: 'duckpgq',
    description: 'Adds support for SQL/PGQ and graph algorithms',
    type: 'community',
  },
  {
    name: 'evalexpr_rhai',
    description: 'Evaluate the Rhai scripting language in DuckDB',
    type: 'community',
  },
  {
    name: 'faiss',
    description: 'Provides access to faiss indices from DuckDB',
    type: 'community',
  },
  {
    name: 'flockmtl',
    description: 'LLM & RAG extension to combine analytics and semantic analysis',
    type: 'community',
  },
  {
    name: 'fuzzycomplete',
    description: 'Fuzzy matching based autocompletion',
    type: 'community',
  },
  {
    name: 'geography',
    description: 'Global spatial data processing on the sphere',
    type: 'community',
  },
  {
    name: 'h3',
    description: 'Hierarchical hexagonal indexing for geospatial data',
    type: 'community',
  },
  {
    name: 'hdf5',
    description: 'Read HDF5 files from DuckDB',
    type: 'community',
  },
  {
    name: 'hostfs',
    description: 'Navigate and explore the filesystem using SQL',
    type: 'community',
  },
  {
    name: 'http_client',
    description: 'DuckDB HTTP Client Extension',
    type: 'community',
  },
  {
    name: 'lindel',
    description: 'Linearization/Delinearization, Z-Order, Hilbert and Morton Curves',
    type: 'community',
  },
  {
    name: 'magic',
    description: 'libmagic/file utilities ported to DuckDB',
    type: 'community',
  },
  {
    name: 'msolap',
    description: 'Connect to Microsoft SQL Server Analysis Services and OLAP data sources',
    type: 'community',
  },
  {
    name: 'nanoarrow',
    description: 'Consume and produce Apache Arrow interprocess communication (IPC) format',
    type: 'community',
  },
  {
    name: 'nanodbc',
    description: 'Connect to any ODBC-compatible database',
    type: 'community',
  },
  {
    name: 'netquack',
    description: 'Parse, extract, and analyze domains, URIs, and paths',
    type: 'community',
  },
  {
    name: 'ofquack',
    description: 'Integrate DuckDB with Oracle Fusion via WSDL-based SOAP calls',
    type: 'community',
  },
  {
    name: 'open_prompt',
    description: 'Interact with LLMs with a simple DuckDB Extension',
    type: 'community',
  },
  {
    name: 'parser_tools',
    description: 'Parse referenced tables and usage context from SQL queries',
    type: 'community',
  },
  {
    name: 'pbix',
    description: 'Parse data model embedded in PowerBI files',
    type: 'community',
  },
  {
    name: 'pcap',
    description: 'Read and analyze network packet capture files',
    type: 'community',
  },
  {
    name: 'phone',
    description: 'Phone number parsing and validation',
    type: 'community',
  },
  {
    name: 'prql',
    description: 'Support for PRQL (Pipelined Relational Query Language)',
    type: 'community',
  },
  {
    name: 'promptloop',
    description: 'AI-powered data extraction and transformation',
    type: 'community',
  },
  {
    name: 'quack',
    description: 'DuckDB extension framework utilities',
    type: 'community',
  },
  {
    name: 'read_text',
    description: 'Enhanced text file reading capabilities',
    type: 'community',
  },
  {
    name: 'roapi',
    description: 'Read-only API access for various data sources',
    type: 'community',
  },
  {
    name: 'roaring',
    description: 'Roaring bitmap compression and operations',
    type: 'community',
  },
  {
    name: 'rust_uuid',
    description: 'UUID generation and manipulation using Rust',
    type: 'community',
  },
  {
    name: 'scrooge',
    description: 'Financial and monetary data operations',
    type: 'community',
  },
  {
    name: 'sheet_reader',
    description: 'Read various spreadsheet formats',
    type: 'community',
  },
  {
    name: 'shellfs',
    description: 'Execute shell commands and read their output as tables',
    type: 'community',
  },
  {
    name: 'simple_encryption',
    description: 'Simple encryption and decryption functions',
    type: 'community',
  },
  {
    name: 'space',
    description: 'Spatial operations and data types',
    type: 'community',
  },
  {
    name: 'survival',
    description: 'Survival analysis functions',
    type: 'community',
  },
  {
    name: 'teradata',
    description: 'Teradata database compatibility functions',
    type: 'community',
  },
  {
    name: 'tinytds',
    description: 'Connect to Microsoft SQL Server databases',
    type: 'community',
  },
  {
    name: 'vcf',
    description: 'Read and analyze VCF (Variant Call Format) genomic files',
    type: 'community',
  },
  {
    name: 'vector_similarity',
    description: 'Vector similarity search and operations',
    type: 'community',
  },
  {
    name: 'wkb',
    description: 'Well-Known Binary (WKB) geospatial data format support',
    type: 'community',
  },
  {
    name: 'xls_blob',
    description: 'Read Excel files stored as BLOBs',
    type: 'community',
  },
];

const initialExtensions = [
  // Required extensions should be marked as installed by default
  // They will be installed on first actual use if not present
  ...REQUIRED_EXTENSIONS_WITH_ENV.map((ext: Omit<DuckDBExtension, 'installed' | 'disabled'>) => ({
    ...ext,
    installed: true, // Changed back to true to fix race condition
    disabled: false,
  })),
  ...CORE_EXTENSIONS.map((ext: Omit<DuckDBExtension, 'installed' | 'disabled'>) => ({
    ...ext,
    installed: false,
    disabled: false,
  })),
  ...COMMUNITY_EXTENSIONS.map((ext: Omit<DuckDBExtension, 'installed' | 'disabled'>) => ({
    ...ext,
    installed: false,
    disabled: false,
  })),
];

// Track if store has been hydrated from persistence
let storeHydrated = false;
let hydrationPromise: Promise<void> | null = null;

export const useExtensionManagementStore = create<ExtensionManagementState>()(
  persist(
    (set, get) => ({
      extensions: initialExtensions,
      isLoading: false,
      error: null,

      loadExtensions: async (pool: any) => {
        set({ isLoading: true, error: null });
        try {
          if (!pool) {
            // Even without a pool, show the available extensions
            set({ isLoading: false });
            return;
          }

          // Try to get the installed extensions from DuckDB
          try {
            const result = await pool.query(`
              SELECT extension_name, loaded
              FROM duckdb_extensions()
              WHERE installed = true
            `);

            const installedExtensions = result.rows.map((row: any) => row.extension_name);
            const loadedExtensions = result.rows
              .filter((row: any) => row.loaded)
              .map((row: any) => row.extension_name);

            set((state: ExtensionManagementState) => ({
              extensions: state.extensions.map((ext: DuckDBExtension) => ({
                ...ext,
                installed: installedExtensions.includes(ext.name),
                // An extension is disabled if it's installed but not loaded
                // EXCEPT for required extensions - they should never be disabled
                disabled: ext.required
                  ? false
                  : installedExtensions.includes(ext.name) && !loadedExtensions.includes(ext.name),
              })),
              isLoading: false,
            }));
          } catch (queryError) {
            // If the query fails, just show the extensions without status
            console.warn('Could not query extension status:', queryError);
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('Failed to load extensions:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to load extensions',
            isLoading: false,
          });
        }
      },

      installExtension: async (pool: any, name: string) => {
        set({ isLoading: true, error: null });
        try {
          const extension = get().extensions.find((ext: DuckDBExtension) => ext.name === name);

          if (!extension) {
            throw new Error(`Extension ${name} not found`);
          }

          if (!pool) {
            throw new Error('Database connection not available');
          }

          // Use ExtensionLoader service to install and load
          const { ExtensionLoader } = await import('../services/extension-loader');
          await ExtensionLoader.installAndLoadExtension(pool, name, extension.type === 'core');

          set((state: ExtensionManagementState) => ({
            extensions: state.extensions.map((ext: DuckDBExtension) =>
              ext.name === name ? { ...ext, installed: true, disabled: false } : ext,
            ),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : `Failed to install extension ${name}`,
            isLoading: false,
          });
        }
      },

      uninstallExtension: async (pool: any, name: string) => {
        set({ isLoading: true, error: null });
        try {
          if (!pool) {
            throw new Error('Database connection not available');
          }

          const { ExtensionLoader } = await import('../services/extension-loader');
          await ExtensionLoader.uninstallExtension(pool, name);

          set((state: ExtensionManagementState) => ({
            extensions: state.extensions.map((ext: DuckDBExtension) =>
              ext.name === name ? { ...ext, installed: false, disabled: false } : ext,
            ),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : `Failed to uninstall extension ${name}`,
            isLoading: false,
          });
        }
      },

      toggleDisabled: (name: string, disabled: boolean) => {
        set((state: ExtensionManagementState) => ({
          extensions: state.extensions.map((ext: DuckDBExtension) =>
            ext.name === name ? { ...ext, disabled } : ext,
          ),
        }));
      },

      getActiveExtensions: () => {
        return get().extensions.filter((ext: DuckDBExtension) => ext.installed && !ext.disabled);
      },
    }),
    {
      name: 'extension-management',
      version: 2, // Increment version to handle migration
      partialize: (state) => ({
        extensions: state.extensions.map((ext: DuckDBExtension) => ({
          name: ext.name,
          installed: ext.installed,
          disabled: ext.disabled,
        })),
      }),
      migrate: (persistedState: any, version: number) => {
        // Handle migration from version 1 to version 2
        if (version === 1 || !version) {
          // Version 1 didn't have proper structure, just return the state as-is
          // The merge function will handle proper initialization
          return persistedState;
        }
        return persistedState;
      },
      onRehydrateStorage: () => (_state) => {
        // This runs after the store has been rehydrated
        storeHydrated = true;
        if (hydrationPromise) {
          // Resolve any waiting promises
          hydrationPromise = null;
        }
      },
      merge: (persistedState: any, currentState: any) => {
        // Merge persisted state with current state, keeping the full extension info
        const mergedExtensions = initialExtensions.map((ext: DuckDBExtension) => {
          const persisted = persistedState?.extensions?.find((p: any) => p.name === ext.name);
          if (persisted) {
            return {
              ...ext,
              installed: persisted.installed || false,
              disabled: persisted.disabled || false,
            };
          }
          return ext;
        });

        return {
          ...currentState,
          ...persistedState,
          extensions: mergedExtensions,
        };
      },
    },
  ),
);

/**
 * Wait for the extension store to be hydrated from persistent storage
 * This must be called before any operations that depend on persisted extension state
 */
export async function waitForExtensionStoreHydration(): Promise<void> {
  if (storeHydrated) {
    return;
  }

  if (!hydrationPromise) {
    hydrationPromise = new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (storeHydrated) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50); // Check every 50ms

      // Timeout after 2 seconds to prevent infinite waiting
      setTimeout(() => {
        clearInterval(checkInterval);
        storeHydrated = true; // Force hydrated state
        resolve();
      }, 2000);
    });
  }

  return hydrationPromise;
}
