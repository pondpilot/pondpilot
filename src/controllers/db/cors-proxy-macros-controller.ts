import { ConnectionPool } from '@engines/types';
import { getCorsProxyMacros } from '@utils/attach-cors-rewriter';

/**
 * Install CORS proxy macros into DuckDB
 *
 * Creates macros for explicit CORS proxy control:
 * - attach_with_proxy(url, db_name): Force proxy usage
 * - attach_direct(url, db_name): Skip proxy
 *
 * @param conn - DuckDB connection pool
 */
export async function installCorsProxyMacros(conn: ConnectionPool): Promise<void> {
  try {
    const macros = getCorsProxyMacros();

    for (const macro of macros) {
      await conn.query(macro);
    }

    // Successfully installed - no logging needed in production
  } catch (error) {
    console.error('Failed to install CORS proxy macros:', error);
    // Don't throw - this is not critical for app functionality
  }
}
