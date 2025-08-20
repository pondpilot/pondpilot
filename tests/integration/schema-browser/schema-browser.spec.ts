import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

import { expect, mergeTests } from '@playwright/test';

import { test as dbExplorerTest } from '../fixtures/db-explorer';
import { test as filePickerTest } from '../fixtures/file-picker';
import { test as notificationTest } from '../fixtures/notifications';
import { test as baseTest } from '../fixtures/page';
import { test as schemaBrowserTest } from '../fixtures/schema-browser';

const test = mergeTests(
  baseTest,
  filePickerTest,
  dbExplorerTest,
  schemaBrowserTest,
  notificationTest,
);

test.describe('Schema Browser', () => {
  // eslint-disable-next-line playwright/expect-expect
  test('should display schema browser for single table database', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    openDatabaseExplorer,
    getDBNodeByName,
    waitForSchemaLoaded,
    assertSchemaBrowserLoaded,
    assertTableNodeContent,
    page,
  }) => {
    // Create a simple DuckDB database with one table
    const dbPath = testTmp.join('single_table.duckdb');
    execSync(`duckdb "${dbPath}" -c "
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users (id, name, email) VALUES 
        (1, 'Alice Smith', 'alice@example.com'),
        (2, 'Bob Johnson', 'bob@example.com');
    "`);

    // Upload and add the database file
    await storage.uploadFile(dbPath, 'single_table.duckdb');
    await filePicker.selectFiles(['single_table.duckdb']);
    await addFile();

    // Open database explorer first
    await openDatabaseExplorer();

    // Right-click on the database and select Show Schema
    const dbNode = await getDBNodeByName('single_table');
    await dbNode.click({ button: 'right' });
    await page.locator('text=Show Schema').click();

    await waitForSchemaLoaded();

    // Assert schema browser loaded with one table
    await assertSchemaBrowserLoaded(1);

    // Assert table node contains expected columns
    await assertTableNodeContent('users', ['id', 'name', 'email', 'created_at']);
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should display schema browser for multi-table database with relationships', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    openDatabaseExplorer,
    getDBNodeByName,
    waitForSchemaLoaded,
    assertSchemaBrowserLoaded,
    assertTableNodeContent,
    page,
  }) => {
    // Create a more complex database with relationships
    const dbPath = testTmp.join('multi_table.duckdb');
    execSync(`duckdb "${dbPath}" -c "
      CREATE TABLE customers (
        customer_id INTEGER PRIMARY KEY,
        company_name VARCHAR(100) NOT NULL,
        contact_email VARCHAR(255)
      );
      
      CREATE TABLE orders (
        order_id INTEGER PRIMARY KEY,
        customer_id INTEGER,
        order_date DATE,
        total_amount DECIMAL(10,2),
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
      );
      
      CREATE TABLE order_items (
        item_id INTEGER PRIMARY KEY,
        order_id INTEGER,
        product_name VARCHAR(100),
        quantity INTEGER,
        unit_price DECIMAL(8,2),
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
      );
      
      INSERT INTO customers VALUES 
        (1, 'Acme Corp', 'orders@acme.com'),
        (2, 'Tech Solutions', 'billing@techsol.com');
        
      INSERT INTO orders VALUES 
        (101, 1, '2024-01-15', 299.99),
        (102, 2, '2024-01-16', 599.50);
        
      INSERT INTO order_items VALUES 
        (1, 101, 'Widget A', 2, 149.99),
        (2, 102, 'Service Package', 1, 599.50);
    "`);

    // Upload and add the database file
    await storage.uploadFile(dbPath, 'multi_table.duckdb');
    await filePicker.selectFiles(['multi_table.duckdb']);
    await addFile();

    // Open database explorer first
    await openDatabaseExplorer();

    // Right-click on the database and select Show Schema
    const dbNode = await getDBNodeByName('multi_table');
    await dbNode.click({ button: 'right' });
    await page.locator('text=Show Schema').click();
    await waitForSchemaLoaded();

    // Assert schema browser loaded with three tables
    await assertSchemaBrowserLoaded(3);

    // Assert each table contains expected columns
    await assertTableNodeContent('customers', ['customer_id', 'company_name', 'contact_email']);
    await assertTableNodeContent('orders', [
      'order_id',
      'customer_id',
      'order_date',
      'total_amount',
    ]);
    await assertTableNodeContent('order_items', [
      'item_id',
      'order_id',
      'product_name',
      'quantity',
      'unit_price',
    ]);
  });

  test('should toggle layout direction', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    openDatabaseExplorer,
    getDBNodeByName,
    waitForSchemaLoaded,
    schemaDirectionControl,
    toggleSchemaDirection,
    page,
  }) => {
    // Create a simple database
    const dbPath = testTmp.join('layout_test.duckdb');
    execSync(`duckdb "${dbPath}" -c "CREATE TABLE test_table (id INTEGER, name VARCHAR);"`);

    // Upload and add the database file
    await storage.uploadFile(dbPath, 'layout_test.duckdb');
    await filePicker.selectFiles(['layout_test.duckdb']);
    await addFile();

    // Open database explorer first
    await openDatabaseExplorer();

    // Right-click on the database and select Show Schema
    const dbNode = await getDBNodeByName('layout_test');
    await dbNode.click({ button: 'right' });
    await page.locator('text=Show Schema').click();
    await waitForSchemaLoaded();

    // Assert controls are visible
    await expect(schemaDirectionControl).toBeVisible();

    // Count active options initially
    const initialActiveCount = await schemaDirectionControl.locator('[data-active="true"]').count();
    expect(initialActiveCount).toBeGreaterThan(0);

    // Toggle to different layout
    await toggleSchemaDirection();

    // Verify the toggle worked by checking that nodes are still visible (layout changed)
    await expect(page.locator('.react-flow__node').first()).toBeVisible();

    // Toggle back
    await toggleSchemaDirection();

    // Verify nodes are still visible after toggle back
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
  });

  test('should refresh schema browser', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    openDatabaseExplorer,
    getDBNodeByName,
    waitForSchemaLoaded,
    refreshSchema,
    assertSchemaBrowserLoaded,
    schemaRefreshButton,
    page,
  }) => {
    // Create a simple database
    const dbPath = testTmp.join('refresh_test.duckdb');
    execSync(`duckdb "${dbPath}" -c "CREATE TABLE initial_table (id INTEGER);"`);

    // Upload and add the database file
    await storage.uploadFile(dbPath, 'refresh_test.duckdb');
    await filePicker.selectFiles(['refresh_test.duckdb']);
    await addFile();

    // Open database explorer first
    await openDatabaseExplorer();

    // Right-click on the database and select Show Schema
    const dbNode = await getDBNodeByName('refresh_test');
    await dbNode.click({ button: 'right' });
    await page.locator('text=Show Schema').click();
    await waitForSchemaLoaded();

    // Assert initial state
    await assertSchemaBrowserLoaded(1);

    // Verify refresh button is present and clickable
    await expect(schemaRefreshButton).toBeVisible();
    await expect(schemaRefreshButton).toBeEnabled();

    // Refresh the schema
    await refreshSchema();

    // Schema should still be loaded (same content since we didn't change the DB)
    await assertSchemaBrowserLoaded(1);
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should handle CSV file schema visualization', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    page,
    waitForSchemaLoaded,
    assertSchemaBrowserLoaded,
    assertTableNodeContent,
  }) => {
    // Create a CSV file with sample data
    const csvPath = testTmp.join('sample_data.csv');
    const csvContent = `id,name,age,city
1,Alice,25,New York
2,Bob,30,San Francisco
3,Charlie,35,Chicago`;

    // Write CSV file to filesystem
    writeFileSync(csvPath, csvContent);

    // Upload and add the CSV file
    await storage.uploadFile(csvPath, 'sample_data.csv');
    await filePicker.selectFiles(['sample_data.csv']);
    await addFile();

    // Wait for file to appear in file explorer by checking for its presence
    const csvFileNode = page.getByText('sample_data', { exact: true });
    await expect(csvFileNode).toBeVisible({ timeout: 10000 });

    // Right-click on the CSV file and select Show Schema
    await csvFileNode.click({ button: 'right' });
    await page.locator('text=Show Schema').click();
    await waitForSchemaLoaded();

    // Assert schema browser loaded with one table (the CSV file)
    await assertSchemaBrowserLoaded(1);

    // Assert table node contains expected columns from CSV
    await assertTableNodeContent('sample_data', ['id', 'name', 'age', 'city']);
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should handle database views in schema browser', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    openDatabaseExplorer,
    getDBNodeByName,
    waitForSchemaLoaded,
    assertSchemaBrowserLoaded,
    assertTableNodeContent,
    page,
  }) => {
    // Create a database with tables and views
    const dbPath = testTmp.join('views_test.duckdb');
    execSync(`duckdb "${dbPath}" -c "
      CREATE TABLE products (
        product_id INTEGER PRIMARY KEY,
        product_name VARCHAR(100),
        price DECIMAL(10,2),
        category VARCHAR(50)
      );
      
      CREATE VIEW expensive_products AS 
      SELECT product_id, product_name, price 
      FROM products 
      WHERE price > 100;
      
      INSERT INTO products VALUES 
        (1, 'Laptop', 999.99, 'Electronics'),
        (2, 'Mouse', 29.99, 'Electronics'),
        (3, 'Desk', 299.99, 'Furniture');
    "`);

    // Upload and add the database file
    await storage.uploadFile(dbPath, 'views_test.duckdb');
    await filePicker.selectFiles(['views_test.duckdb']);
    await addFile();

    // Open database explorer first
    await openDatabaseExplorer();

    // Right-click on the database and select Show Schema
    const dbNode = await getDBNodeByName('views_test');
    await dbNode.click({ button: 'right' });
    await page.locator('text=Show Schema').click();
    await waitForSchemaLoaded();

    // Assert schema browser loaded with both table and view
    await assertSchemaBrowserLoaded(2);

    // Assert table content
    await assertTableNodeContent('products', ['product_id', 'product_name', 'price', 'category']);

    // Assert view content
    await assertTableNodeContent('expensive_products', ['product_id', 'product_name', 'price']);
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should handle empty database schema gracefully', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    assertFileExplorerItems,
  }) => {
    // Create an empty database
    const dbPath = testTmp.join('empty.duckdb');
    execSync(`duckdb "${dbPath}" -c "SELECT 1;"`); // Just initialize the DB

    // Upload and add the database file
    await storage.uploadFile(dbPath, 'empty.duckdb');
    await filePicker.selectFiles(['empty.duckdb']);
    await addFile();

    // Verify the empty database is not in the file explorer
    await assertFileExplorerItems([]);
  });

  // eslint-disable-next-line playwright/expect-expect
  test('should handle very large schemas with performance limits', async ({
    addFile,
    storage,
    filePicker,
    testTmp,
    openDatabaseExplorer,
    getDBNodeByName,
    waitForSchemaLoaded,
    page,
  }) => {
    // Create a database with many tables
    const dbPath = testTmp.join('large_schema.duckdb');
    let createTableStatements = '';
    for (let i = 0; i < 60; i += 1) {
      createTableStatements += `CREATE TABLE table_${i} (id INTEGER PRIMARY KEY, data VARCHAR(100));`;
    }
    execSync(`duckdb "${dbPath}" -c "${createTableStatements}"`);

    // Upload and add the database file
    await storage.uploadFile(dbPath, 'large_schema.duckdb');
    await filePicker.selectFiles(['large_schema.duckdb']);
    await addFile();

    // Open database explorer first
    await openDatabaseExplorer();

    // Right-click on the database and select Show Schema
    const dbNode = await getDBNodeByName('large_schema');
    await dbNode.click({ button: 'right' });
    await page.locator('text=Show Schema').click();
    await waitForSchemaLoaded();

    // Should show warning about performance - wait for the warning component
    const warningPanel = page.locator('.bg-yellow-100, .dark\\:bg-yellow-900');
    await expect(warningPanel).toBeVisible({ timeout: 10000 });

    // The warning should mention large schema
    await expect(page.locator('text=/Large schema detected.*60 tables/i')).toBeVisible();
  });
});
