import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { getCorsProxyMacros } from '@utils/attach-cors-rewriter';
import { getGSheetPublicReadMacros } from '@utils/gsheet-public-read';

/**
 * Install helper macros into DuckDB
 *
 * Creates macros for explicit CORS proxy control:
 * - attach_with_proxy(url, db_name): Force proxy usage
 * - attach_direct(url, db_name): Skip proxy
 * - gsheet_public_csv_url(url): normalize Google Sheets URL to CSV export URL
 * - read_gsheet_public(url): read public Google Sheet as a table
 * - read_gsheet_authorized(url): read Google Sheet with bearer-token HTTP secret
 * - read_gsheet(url): compatibility alias that falls back to CSV export reads
 *
 * @param conn - DuckDB connection pool
 */
export async function installCorsProxyMacros(conn: AsyncDuckDBConnectionPool): Promise<void> {
  try {
    const macros = [...getCorsProxyMacros(), ...getGSheetPublicReadMacros()];

    for (const macro of macros) {
      await conn.query(macro);
    }

    // Successfully installed - no logging needed in production
  } catch (error) {
    console.error('Failed to install CORS proxy macros:', error);
    // Don't throw - this is not critical for app functionality
  }
}
