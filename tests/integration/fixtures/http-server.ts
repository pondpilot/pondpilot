/**
 * HTTPServer fixture for mocking DuckDB HTTP Server API responses
 */

import { test as base } from '@playwright/test';

interface HttpServerOptions {
  connectionSuccess?: boolean;
  tables?: Array<{ name: string; columns: Array<{ name: string; type: string }> }>;
}

export interface HttpServerFixture {
  setupHttpServerMocks: (options?: HttpServerOptions) => Promise<void>;
}

export const test = base.extend<HttpServerFixture>({
  setupHttpServerMocks: async ({ page }, use) => {
    const setupMocks = async (options: HttpServerOptions = {}) => {
      const {
        connectionSuccess = true,
        tables = [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INTEGER' },
              { name: 'name', type: 'VARCHAR' },
              { name: 'email', type: 'VARCHAR' },
            ],
          },
          {
            name: 'orders',
            columns: [
              { name: 'id', type: 'INTEGER' },
              { name: 'user_id', type: 'INTEGER' },
              { name: 'amount', type: 'DOUBLE' },
            ],
          },
        ],
      } = options;

      // Mock HTTP server responses with multiple patterns to catch all requests
      const mockHandler = async (route: any) => {
        const request = route.request();
        const method = request.method();

        if (method === 'GET' || method === 'HEAD') {
          const requestUrl = new URL(request.url());
          const queryParam = requestUrl.searchParams.get('query');

          if (queryParam) {
            // Handle GET requests with query parameter (for DuckDB view creation)
            const sql = decodeURIComponent(queryParam);
            let responseData: any[] = [];

            if (sql.includes('SELECT * FROM users')) {
              // Return sample user data
              responseData = [
                { id: 1, name: 'John Doe', email: 'john@example.com' },
                { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
              ];
            } else if (sql.includes('SELECT * FROM orders')) {
              // Return sample order data
              responseData = [
                { id: 1, user_id: 1, amount: 99.99 },
                { id: 2, user_id: 2, amount: 149.5 },
              ];
            } else if (sql.includes('SELECT * FROM empty_table')) {
              // Return empty data for empty table test
              responseData = [];
            } else {
              // Default empty response for unknown queries
              responseData = [];
            }

            // Format response as JSON Lines (DuckDB HTTP server format)
            const jsonLines = responseData.map((row) => JSON.stringify(row)).join('\n');

            await route.fulfill({
              status: 200,
              headers: {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
                'Access-Control-Allow-Headers': '*',
              },
              body: method === 'HEAD' ? '' : jsonLines,
            });
          } else if (connectionSuccess) {
            // Connection test endpoint (ping) - success
            await route.fulfill({
              status: 200,
              headers: { 'Content-Type': 'text/plain' },
              body: 'OK',
            });
          } else {
            // Connection test endpoint (ping) - failure
            await route.fulfill({
              status: 500,
              headers: { 'Content-Type': 'text/plain' },
              body: 'Connection failed',
            });
          }
        } else if (method === 'POST') {
          // SQL query endpoint
          const sql = request.postData() || '';
          // Mock HTTP Server received SQL query

          let responseData: any[] = [];

          if (sql.includes('duckdb_tables()')) {
            // Return table list
            responseData = tables.map((table: any) => ({
              table_name: table.name,
              schema_name: 'main',
            }));
          } else if (sql.includes('duckdb_columns()')) {
            // Return column information
            responseData = tables.flatMap((table: any) =>
              table.columns.map((col: any, index: number) => ({
                table_name: table.name,
                column_name: col.name,
                data_type: col.type,
                is_nullable: false,
                column_index: index,
                schema_name: 'main',
              })),
            );
          } else if (sql.includes('SELECT * FROM users')) {
            // Return sample user data
            responseData = [
              { id: 1, name: 'John Doe', email: 'john@example.com' },
              { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
            ];
          } else if (sql.includes('SELECT * FROM orders')) {
            // Return sample order data
            responseData = [
              { id: 1, user_id: 1, amount: 99.99 },
              { id: 2, user_id: 2, amount: 149.5 },
            ];
          } else if (sql.includes('SELECT * FROM empty_table')) {
            // Return empty data for empty table test
            responseData = [];
          } else {
            // Default empty response for unknown queries
            responseData = [];
          }

          // Format response as JSON Lines (DuckDB HTTP server format)
          const jsonLines = responseData.map((row) => JSON.stringify(row)).join('\n');

          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: jsonLines,
          });
        }
      };

      // Add multiple route patterns to catch requests from different contexts
      await page.route('http://localhost:9999/', mockHandler);
      await page.route('http://localhost:9999/**', mockHandler);
      await page.route('**/localhost:9999/', mockHandler);
      await page.route('**/localhost:9999/**', mockHandler);
    };

    await use(setupMocks);
  },
});
