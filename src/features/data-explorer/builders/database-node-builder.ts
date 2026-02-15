import { showWarning } from '@components/app-notifications';
import { TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { IconType } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { clearComparisonResults } from '@controllers/comparison';
import { createSQLScript } from '@controllers/sql-script';
import {
  findTabFromFlatFileDataSource,
  findTabFromLocalDBObject,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromLocalDBObject,
  getOrCreateTabFromScript,
  getOrCreateSchemaBrowserTab,
  setActiveTabId,
  setPreviewTabId,
} from '@controllers/tab';
import {
  findTabFromComparison,
  getOrCreateTabFromComparison,
} from '@controllers/tab/comparison-tab-controller';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { Comparison } from '@models/comparison';
import { PersistentDataSourceId } from '@models/data-source';
import { DBColumn, DBSchema, DBTableOrView } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { copyToClipboard } from '@utils/clipboard';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';
import { buildComparisonMenuItems } from '../utils/comparison-menu-items';
import { buildConvertToMenuItems } from '../utils/convert-to-menu-items';
import { refreshDatabaseMetadata } from '../utils/metadata-refresh';

interface BuilderContext {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
}

export interface ExtendedBuilderContext extends BuilderContext {
  flatFileSources?: Map<string, any>;
  comparisonByTableName?: Map<string, Comparison>;
  comparisonTableNames?: Set<string>;
}

/**
 * Builds a tree node representing a database column with appropriate context menu and icon
 *
 * @param dbId - Persistent identifier for the database source
 * @param schemaName - Name of the database schema containing the column
 * @param objectName - Name of the table or view containing the column
 * @param column - Column metadata including name and SQL type
 * @param context - Builder context containing node maps for tree structure
 * @returns TreeNodeData configured for a database column with copy functionality
 */
export function buildColumnTreeNode({
  nodeDbId,
  sourceDbId,
  schemaName,
  objectName,
  column,
  context,
}: {
  nodeDbId: string;
  sourceDbId: PersistentDataSourceId;
  schemaName: string;
  objectName: string;
  column: DBColumn;
  context: BuilderContext;
}): TreeNodeData<DataExplorerNodeTypeMap> {
  const { name: columnName, sqlType } = column;
  const columnNodeId = `${nodeDbId}.${schemaName}.${objectName}::${columnName}`;
  const iconType: IconType = getIconTypeForSQLType(sqlType);

  context.nodeMap.set(columnNodeId, {
    db: sourceDbId,
    schemaName,
    objectName,
    columnName,
  });
  context.anyNodeIdToNodeTypeMap.set(columnNodeId, 'column');

  return {
    nodeType: 'column',
    value: columnNodeId,
    label: columnName,
    iconType,
    isDisabled: false,
    isSelectable: false,
    contextMenu: [
      {
        children: [
          {
            label: 'Copy name',
            onClick: () => {
              copyToClipboard(toDuckDBIdentifier(columnName), {
                showNotification: true,
                notificationTitle: 'Column name copied',
              });
            },
          },
        ],
      },
    ],
  };
}

/**
 * Builds a tree node representing a database table or view with comprehensive functionality
 *
 * Handles special cases:
 * - File views in system database (pondpilot) are styled differently
 * - System database objects can be dropped (except file views)
 * - Includes context menu for querying, schema viewing, and copying names
 * - Supports column expansion in development mode
 *
 * @param dbId - Persistent identifier for the database source
 * @param dbName - Name of the database containing the object
 * @param schemaName - Name of the schema containing the object
 * @param object - Table or view metadata including columns
 * @param fileViewNames - Set of file view names for identifying special views
 * @param conn - Database connection pool for operations like dropping objects
 * @param context - Builder context containing node maps for tree structure
 * @returns TreeNodeData configured for a database table/view with full functionality
 */
export function buildObjectTreeNode({
  nodeDbId,
  sourceDbId,
  dbName,
  schemaName,
  object,
  fileViewNames,
  comparisonTableNames,
  conn,
  context,
  databaseName,
}: {
  nodeDbId: string;
  sourceDbId: PersistentDataSourceId;
  dbName: string;
  schemaName: string;
  object: DBTableOrView;
  fileViewNames?: Set<string>;
  comparisonTableNames?: Set<string>;
  conn?: AsyncDuckDBConnectionPool;
  context: ExtendedBuilderContext;
  databaseName?: string;
}): TreeNodeData<DataExplorerNodeTypeMap> {
  const { name: objectName, columns } = object;
  const objectNodeId = `${nodeDbId}.${schemaName}.${objectName}`;
  const resolvedDatabaseName = databaseName ?? dbName;

  context.nodeMap.set(objectNodeId, {
    db: sourceDbId,
    databaseName: resolvedDatabaseName,
    schemaName,
    objectName,
    columnName: null,
  });
  context.anyNodeIdToNodeTypeMap.set(objectNodeId, 'object');

  const fqn = `${toDuckDBIdentifier(dbName)}.${toDuckDBIdentifier(schemaName)}.${toDuckDBIdentifier(objectName)}`;

  // We only allow expanding columns in dev builds as of today
  let sortedColumns: DBColumn[] = [];
  let devMenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [];

  if (import.meta.env.DEV) {
    sortedColumns = columns.slice().sort((a, b) => a.name.localeCompare(b.name));
    devMenuItems = [
      {
        label: 'Toggle columns',
        onClick: (node, tree) => tree.toggleExpanded(node.value),
        isDisabled: false,
      },
    ];
  }

  const comparisonForTable =
    object.type === 'table' &&
    dbName === PERSISTENT_DB_NAME &&
    comparisonTableNames?.has(objectName)
      ? context.comparisonByTableName?.get(objectName)
      : undefined;

  const label = objectName;

  // Check if this is a file view in the system database
  const isFileView =
    object.type === 'view' && dbName === PERSISTENT_DB_NAME && fileViewNames?.has(objectName);

  const isComparisonTable = Boolean(comparisonForTable);

  const tooltip =
    isComparisonTable && comparisonForTable
      ? `Comparison: ${comparisonForTable.name}\nLast run: ${comparisonForTable.lastRunAt ? new Date(comparisonForTable.lastRunAt).toLocaleString() : 'Never'}\nTable: ${objectName}`
      : undefined;

  // Allow dropping objects in system database, except file views
  const canDrop = dbName === PERSISTENT_DB_NAME && !isFileView && !isComparisonTable;

  return {
    nodeType: 'object',
    value: objectNodeId,
    label,
    iconType: isComparisonTable ? 'comparison' : object.type === 'table' ? 'db-table' : 'db-view',
    tooltip,
    isDisabled: false,
    isSelectable: true,
    doNotExpandOnClick: true,
    onDelete:
      canDrop && conn
        ? async () => {
            try {
              const dropQuery = `DROP ${object.type.toUpperCase()} IF EXISTS ${fqn}`;
              await conn.query(dropQuery);

              // Refresh database metadata after successful drop
              await refreshDatabaseMetadata(conn, [dbName]);

              if (isComparisonTable && comparisonForTable) {
                await clearComparisonResults(comparisonForTable.id, {
                  tableNameOverride: null,
                });
              }
            } catch (error) {
              // Show user-friendly error notification without exposing internal details
              showWarning({
                title: `Failed to drop ${object.type}`,
                message: `Could not drop ${objectName}. Please check if the ${object.type} is currently in use or try refreshing the database.`,
              });
              // Log detailed error for debugging
              console.error(`Drop ${object.type} failed:`, error);
            }
          }
        : undefined,
    onNodeClick: (_node: any, _tree: any): void => {
      // Special handling for file views in system database
      if (isFileView && context.flatFileSources) {
        // Find the corresponding file data source that has this view
        const fileDataSource = Array.from(context.flatFileSources.values()).find(
          (ds) => ds.viewName === objectName,
        );

        if (fileDataSource) {
          // Check if tab is already open
          const existingTab = findTabFromFlatFileDataSource(fileDataSource);
          if (existingTab) {
            setActiveTabId(existingTab.id);
            return;
          }

          // Open a tab for the file
          const tab = getOrCreateTabFromFlatFileDataSource(fileDataSource, true);
          setPreviewTabId(tab.id);
          return;
        }
      }

      if (isComparisonTable && comparisonForTable) {
        const existingTab = findTabFromComparison(comparisonForTable.id);
        const tab = getOrCreateTabFromComparison(comparisonForTable, true);

        if (!existingTab) {
          setPreviewTabId(tab.id);
        }
        return;
      }

      // Regular table/view handling
      const existingTab = findTabFromLocalDBObject(
        sourceDbId,
        schemaName,
        objectName,
        databaseName,
      );
      if (existingTab) {
        // If the tab is already open, just set as active and do not change preview
        setActiveTabId(existingTab.id);
        return;
      }

      // Net new. Create an active tab
      const tab = getOrCreateTabFromLocalDBObject(
        sourceDbId,
        schemaName,
        objectName,
        object.type,
        true,
        databaseName,
      );
      // Then set as & preview
      setPreviewTabId(tab.id);
    },
    contextMenu: [
      {
        children: [
          {
            label: 'Copy Full Name',
            onClick: () => {
              copyToClipboard(fqn, {
                showNotification: true,
              });
            },
            onAlt: {
              label: 'Copy Name',
              onClick: () => {
                copyToClipboard(toDuckDBIdentifier(objectName), {
                  showNotification: true,
                });
              },
            },
          },
          {
            label: 'Create a Query',
            onClick: () => {
              const query = `SELECT * FROM ${fqn};`;

              const newScript = createSQLScript(`${objectName}_query`, query);
              getOrCreateTabFromScript(newScript, true);
            },
          },
          {
            label: 'Show Schema',
            onClick: () => {
              getOrCreateSchemaBrowserTab({
                sourceId: sourceDbId,
                sourceType: 'db',
                schemaName,
                databaseName: resolvedDatabaseName,
                objectNames: [objectName],
                setActive: true,
              });
            },
          },
          ...buildComparisonMenuItems(() => ({
            type: 'table',
            tableName: objectName,
            schemaName,
            databaseName: dbName,
          })),
          ...buildConvertToMenuItems(() => {
            // Handle file views in system database
            if (isFileView && context.flatFileSources) {
              const fileDataSource = Array.from(context.flatFileSources.values()).find(
                (ds) => ds.viewName === objectName,
              );
              if (fileDataSource) {
                const existingTab = findTabFromFlatFileDataSource(fileDataSource);
                if (existingTab) {
                  setActiveTabId(existingTab.id);
                  return existingTab.id;
                }
                const tab = getOrCreateTabFromFlatFileDataSource(fileDataSource, true);
                setActiveTabId(tab.id);
                return tab.id;
              }
            }

            // Regular table/view handling
            const existingTab = findTabFromLocalDBObject(
              sourceDbId,
              schemaName,
              objectName,
              databaseName,
            );
            if (existingTab) {
              setActiveTabId(existingTab.id);
              return existingTab.id;
            }
            const tab = getOrCreateTabFromLocalDBObject(
              sourceDbId,
              schemaName,
              objectName,
              object.type,
              true,
              databaseName,
            );
            setActiveTabId(tab.id);
            return tab.id;
          }, null),
          ...devMenuItems,
        ],
      },
    ],
    children: sortedColumns.map((column) =>
      buildColumnTreeNode({
        nodeDbId,
        sourceDbId,
        schemaName,
        objectName,
        column,
        context,
      }),
    ),
  };
}

/**
 * Builds a tree node representing a database schema with organized object hierarchy
 *
 * Special handling for system database (pondpilot):
 * - Separates file views from regular objects
 * - Groups file views under a "File Views" section with italic styling
 * - Provides schema-level context menu for copying names and navigation
 *
 * @param dbId - Persistent identifier for the database source
 * @param dbName - Name of the database containing the schema
 * @param schema - Schema metadata including contained objects (tables/views)
 * @param fileViewNames - Set of file view names for special grouping in system DB
 * @param conn - Database connection pool for schema operations
 * @param context - Builder context containing node maps for tree structure
 * @param initialExpandedState - State object for controlling initial expansion
 * @returns TreeNodeData configured for a database schema with organized children
 */
export function buildSchemaTreeNode({
  nodeDbId,
  sourceDbId,
  dbName,
  schema,
  fileViewNames,
  comparisonTableNames,
  conn,
  context,
  initialExpandedState,
  databaseName,
}: {
  nodeDbId: string;
  sourceDbId: PersistentDataSourceId;
  dbName: string;
  schema: DBSchema;
  fileViewNames?: Set<string>;
  comparisonTableNames?: Set<string>;
  conn?: AsyncDuckDBConnectionPool;
  context: ExtendedBuilderContext;
  initialExpandedState: Record<string, boolean>;
  databaseName?: string;
}): TreeNodeData<DataExplorerNodeTypeMap> {
  const { name: schemaName, objects } = schema;
  const schemaNodeId = `${nodeDbId}.${schemaName}`;
  const resolvedDatabaseName = databaseName ?? dbName;

  context.nodeMap.set(schemaNodeId, {
    db: sourceDbId,
    databaseName: resolvedDatabaseName,
    schemaName,
    objectName: null,
    columnName: null,
  });
  context.anyNodeIdToNodeTypeMap.set(schemaNodeId, 'schema');

  // Don't expand schemas by default
  initialExpandedState[schemaNodeId] = false;

  const sortedObjects = objects.slice().sort((a, b) => a.name.localeCompare(b.name));

  // For system database, separate file views from regular objects
  let children: TreeNodeData<DataExplorerNodeTypeMap>[] = [];

  if (
    dbName === PERSISTENT_DB_NAME &&
    schemaName === 'main' &&
    (fileViewNames || comparisonTableNames)
  ) {
    // Separate special categories and regular objects
    const fileViews: DBTableOrView[] = [];
    const comparisonTables: DBTableOrView[] = [];
    const regularObjects: DBTableOrView[] = [];

    for (const object of sortedObjects) {
      if (object.type === 'view' && fileViewNames?.has(object.name)) {
        fileViews.push(object);
      } else if (object.type === 'table' && comparisonTableNames?.has(object.name)) {
        comparisonTables.push(object);
      } else {
        regularObjects.push(object);
      }
    }

    // Build regular objects first
    children = regularObjects.map((object) =>
      buildObjectTreeNode({
        nodeDbId,
        sourceDbId,
        dbName,
        schemaName,
        object,
        fileViewNames,
        comparisonTableNames,
        conn,
        context,
        databaseName,
      }),
    );

    // Add file views section if there are any
    if (fileViews.length > 0) {
      const fileViewsSectionId = `${nodeDbId}.${schemaName}.file-views`;
      context.nodeMap.set(fileViewsSectionId, {
        db: sourceDbId,
        databaseName: resolvedDatabaseName,
        schemaName,
        objectName: null,
        columnName: null,
      });
      context.anyNodeIdToNodeTypeMap.set(fileViewsSectionId, 'section');

      children.push({
        nodeType: 'section',
        value: fileViewsSectionId,
        label: 'File Views',
        iconType: 'folder',
        isDisabled: false,
        isSelectable: false,
        contextMenu: [],
        children: fileViews.map((object) =>
          buildObjectTreeNode({
            nodeDbId,
            sourceDbId,
            dbName,
            schemaName,
            object,
            fileViewNames,
            comparisonTableNames,
            conn,
            context,
            databaseName,
          }),
        ),
      });
    }

    if (comparisonTables.length > 0) {
      comparisonTables.sort((a, b) => {
        const nameA = context.comparisonByTableName?.get(a.name)?.name ?? a.name;
        const nameB = context.comparisonByTableName?.get(b.name)?.name ?? b.name;
        return nameA.localeCompare(nameB);
      });

      const comparisonSectionId = `${nodeDbId}.${schemaName}.comparisons`;
      context.nodeMap.set(comparisonSectionId, {
        db: sourceDbId,
        databaseName: resolvedDatabaseName,
        schemaName,
        objectName: null,
        columnName: null,
      });
      context.anyNodeIdToNodeTypeMap.set(comparisonSectionId, 'section');

      const comparisonChildren = comparisonTables.map((object) =>
        buildObjectTreeNode({
          nodeDbId,
          sourceDbId,
          dbName,
          schemaName,
          object,
          fileViewNames,
          comparisonTableNames,
          conn,
          context,
          databaseName,
        }),
      );

      children.push({
        nodeType: 'section',
        value: comparisonSectionId,
        label: 'Comparisons',
        iconType: 'folder',
        isDisabled: false,
        isSelectable: false,
        contextMenu: [],
        children: comparisonChildren,
      });
    }
  } else {
    // For non-system databases, keep the original behavior
    children = sortedObjects.map((object) =>
      buildObjectTreeNode({
        nodeDbId,
        sourceDbId,
        dbName,
        schemaName,
        object,
        fileViewNames,
        comparisonTableNames,
        conn,
        context,
        databaseName,
      }),
    );
  }

  return {
    nodeType: 'schema',
    value: schemaNodeId,
    label: schemaName,
    iconType: 'db-schema',
    isDisabled: false,
    isSelectable: false,
    contextMenu: [
      {
        children: [
          {
            label: 'Copy name',
            onClick: () => {
              navigator.clipboard.writeText(toDuckDBIdentifier(schemaName));
              copyToClipboard(toDuckDBIdentifier(schemaName), {
                showNotification: true,
              });
            },
          },
          {
            label: 'Copy Full Name',
            onClick: () => {
              copyToClipboard(`${toDuckDBIdentifier(dbName)}.${toDuckDBIdentifier(schemaName)}`, {
                showNotification: true,
              });
            },
          },
          {
            label: 'Show Schema',
            onClick: () => {
              getOrCreateSchemaBrowserTab({
                sourceId: sourceDbId,
                sourceType: 'db',
                schemaName,
                databaseName: resolvedDatabaseName,
                setActive: true,
              });
            },
          },
        ],
      },
    ],
    children,
  };
}
