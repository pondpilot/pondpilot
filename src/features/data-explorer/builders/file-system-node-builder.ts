import { TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { IconType } from '@components/named-icon';
import { getIconTypeForSQLType } from '@components/named-icon/utils';
import { deleteDataSources } from '@controllers/data-source';
import { renameFile, renameXlsxFile } from '@controllers/file-explorer';
import { deleteLocalFileOrFolders } from '@controllers/file-system';
import { createSQLScript } from '@controllers/sql-script';
import {
  findTabFromFlatFileDataSource,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromScript,
  getOrCreateSchemaBrowserTab,
  setActiveTabId,
  setPreviewTabId,
  deleteTabByDataSourceId,
} from '@controllers/tab';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { AnyFlatFileDataSource, XlsxSheetView } from '@models/data-source';
import { DBColumn, DataBaseModel } from '@models/db';
import { PERSISTENT_DB_NAME } from '@models/db-persistence';
import { LocalEntry, LocalEntryId } from '@models/file-system';
import { copyToClipboard } from '@utils/clipboard';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import {
  getFlatFileDataSourceIcon,
  getFlatFileDataSourceName,
  getFolderName,
  getLocalEntryIcon,
  getXlsxFileName,
} from '@utils/navigation';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';
import { validateFileRename, validateXlsxFileRename } from '../utils/validation';

interface FileSystemBuilderContext {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: AsyncDuckDBConnectionPool;
  dataSourceByFileId: Map<LocalEntryId, AnyFlatFileDataSource>;
  flatFileSourcesValues: AnyFlatFileDataSource[];
  nonLocalDBFileEntries: LocalEntry[];
  xlsxSheetsByFileId: Map<LocalEntryId, XlsxSheetView[]>;
}

/**
 * Builds a column node for a file in the file system tree
 *
 * @param column - Database column metadata
 * @param fileId - ID of the file this column belongs to
 * @param context - Builder context with node maps
 * @returns TreeNodeData configured as a column node
 */
export function buildFileColumnTreeNode(
  column: DBColumn,
  fileId: LocalEntryId,
  context: FileSystemBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { name: columnName, sqlType } = column;
  const columnNodeId = `${fileId}::${columnName}`;
  const iconType: IconType = getIconTypeForSQLType(sqlType);

  context.nodeMap.set(columnNodeId, {
    entryId: fileId,
    isSheet: false,
    sheetName: null,
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
 * Builds a folder node in the file system tree with deletion and navigation capabilities
 *
 * Features:
 * - Recursive folder structure through buildChildren callback
 * - User-added folders can be deleted
 * - Context menu for name copying and schema browsing
 * - Appropriate folder icon based on entry properties
 *
 * @param entry - LocalEntry representing the folder (must be directory type)
 * @param context - Builder context with connection and data maps
 * @param buildChildren - Callback function to build child nodes recursively
 * @returns TreeNodeData configured as a folder with children and context menu
 * @throws Error if entry is not a directory
 */
export function buildFolderNode(
  entry: LocalEntry,
  context: FileSystemBuilderContext,
  buildChildren: () => TreeNodeData<DataExplorerNodeTypeMap>[],
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { nodeMap, anyNodeIdToNodeTypeMap, conn } = context;

  // Type guard to ensure entry is a folder
  if (entry.kind !== 'directory') {
    throw new Error('Entry must be a folder');
  }

  nodeMap.set(entry.id, { entryId: entry.id, isSheet: false, sheetName: null });
  anyNodeIdToNodeTypeMap.set(entry.id, 'folder');

  return {
    nodeType: 'folder',
    value: entry.id,
    label: getFolderName(entry),
    iconType: getLocalEntryIcon(entry),
    isDisabled: false,
    isSelectable: false,
    onDelete: entry.userAdded ? () => deleteLocalFileOrFolders(conn, [entry.id]) : undefined,
    contextMenu: [
      {
        children: [
          {
            label: 'Copy name',
            onClick: () => {
              copyToClipboard(entry.uniqueAlias, { showNotification: true });
            },
          },
          {
            label: 'Show Schema',
            onClick: () => {
              getOrCreateSchemaBrowserTab({
                sourceId: entry.id,
                sourceType: 'folder',
                setActive: true,
              });
            },
          },
        ],
      },
    ],
    children: buildChildren(),
  };
}

/**
 * Build XLSX sheet node
 */
function buildXlsxSheetNode(
  entry: LocalEntry,
  sheet: XlsxSheetView,
  context: FileSystemBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { nodeMap, anyNodeIdToNodeTypeMap } = context;
  const sheetLabel = sheet.sheetName;
  const sheetId = `${entry.id}::${sheet.sheetName}`;
  const fqn = `main.${toDuckDBIdentifier(sheet.viewName)}`;

  nodeMap.set(sheetId, { entryId: entry.id, isSheet: true, sheetName: sheet.sheetName });
  anyNodeIdToNodeTypeMap.set(sheetId, 'sheet');

  return {
    nodeType: 'sheet',
    value: sheetId,
    label: sheetLabel,
    iconType: 'xlsx-sheet',
    isDisabled: false,
    isSelectable: true,
    onNodeClick: (_node: any, _tree: any): void => {
      const existingTab = findTabFromFlatFileDataSource(sheet.id);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return;
      }

      const tab = getOrCreateTabFromFlatFileDataSource(sheet.id, true);
      setPreviewTabId(tab.id);
    },
    onCloseItemClick: (): void => {
      deleteTabByDataSourceId(sheet.id);
    },
    contextMenu: [
      {
        children: [
          {
            label: 'Copy Full Name',
            onClick: () => {
              copyToClipboard(fqn, { showNotification: true });
            },
            onAlt: {
              label: 'Copy Name',
              onClick: () => {
                copyToClipboard(toDuckDBIdentifier(sheet.viewName), {
                  showNotification: true,
                });
              },
            },
          },
          {
            label: 'Create a Query',
            onClick: () => {
              const query = `SELECT * FROM ${fqn};`;
              const newScript = createSQLScript(`${sheet.sheetName}_query`, query);
              getOrCreateTabFromScript(newScript, true);
            },
          },
        ],
      },
    ],
  };
}

/**
 * Builds an XLSX file node with its constituent sheet nodes as children
 *
 * Features:
 * - Hierarchical display of XLSX file with expandable sheets
 * - Renaming capability for the XLSX file (affects all sheets)
 * - Deletion support for user-added files
 * - Context menu for name copying and schema browsing
 * - Automatic sorting of sheets alphabetically
 *
 * @param entry - LocalEntry representing the XLSX file (must be file type)
 * @param relatedSource - Data source associated with the XLSX file
 * @param sheets - Array of XlsxSheetView objects representing individual sheets
 * @param context - Builder context with connection and validation data
 * @returns TreeNodeData configured as an XLSX file with sheet children
 * @throws Error if entry is not a file
 */
export function buildXlsxFileNode(
  entry: LocalEntry,
  relatedSource: AnyFlatFileDataSource,
  sheets: XlsxSheetView[],
  context: FileSystemBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { nodeMap, anyNodeIdToNodeTypeMap, conn, nonLocalDBFileEntries } = context;

  // Type guard to ensure entry is a file
  if (entry.kind !== 'file') {
    throw new Error('Entry must be a file');
  }

  const onXlsxFileRenameSubmit = (newName: string, thisEntry: LocalEntry): void => {
    newName = newName.trim();
    if (thisEntry.uniqueAlias === newName) {
      // No need to rename if the name has not been changed
      return;
    }
    renameXlsxFile(thisEntry.id, newName, conn);
  };

  // Sort sheets alphabetically for consistent display
  sheets.sort((a, b) => a.sheetName.localeCompare(b.sheetName));

  nodeMap.set(entry.id, { entryId: entry.id, isSheet: false, sheetName: null });
  anyNodeIdToNodeTypeMap.set(entry.id, 'file');

  return {
    nodeType: 'file',
    value: entry.id,
    label: getXlsxFileName(entry),
    iconType: getLocalEntryIcon(entry),
    isDisabled: false,
    isSelectable: false,
    renameCallbacks: {
      prepareRenameValue: () => entry.uniqueAlias,
      validateRename: (_, newName) => validateXlsxFileRename(newName, nonLocalDBFileEntries, entry),
      onRenameSubmit: (_, newName) => onXlsxFileRenameSubmit(newName, entry),
    },
    onDelete: entry.userAdded ? () => deleteLocalFileOrFolders(conn, [entry.id]) : undefined,
    contextMenu: [
      {
        children: [
          {
            label: 'Copy name',
            onClick: () => {
              copyToClipboard(entry.uniqueAlias, { showNotification: true });
            },
          },
          {
            label: 'Show Schema',
            onClick: () => {
              getOrCreateSchemaBrowserTab({
                sourceId: relatedSource.id,
                sourceType: 'file',
                setActive: true,
              });
            },
          },
        ],
      },
    ],
    children: sheets.map((sheet) => buildXlsxSheetNode(entry, sheet, context)),
  };
}

/**
 * Builds a regular file node for non-XLSX data files (CSV, JSON, Parquet, etc.)
 *
 * Features:
 * - Direct data viewing by clicking (opens in tab)
 * - File renaming capability (affects view name in database)
 * - Deletion support for user-added files
 * - Context menu for copying names, creating queries, and schema browsing
 * - Tab management with close button integration
 * - Appropriate file type icons
 *
 * @param entry - LocalEntry representing the data file
 * @param relatedSource - AnyFlatFileDataSource with view and processing information
 * @param context - Builder context with connection and validation capabilities
 * @returns TreeNodeData configured as a data file with full interaction support
 */
export function buildFileNode(
  entry: LocalEntry,
  relatedSource: AnyFlatFileDataSource,
  context: FileSystemBuilderContext,
  options?: {
    databaseMetadata?: Map<string, DataBaseModel>;
    fileViewNames?: Set<string>;
    showColumns?: boolean;
  },
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { nodeMap, anyNodeIdToNodeTypeMap, conn, flatFileSourcesValues } = context;

  const onFileRenameSubmit = (newName: string, fileSource: AnyFlatFileDataSource): void => {
    newName = newName.trim();
    if (fileSource.viewName === newName) {
      // No need to rename if the name has not been changed
      return;
    }
    renameFile(fileSource.id, newName, conn);
  };

  const label = getFlatFileDataSourceName(relatedSource, entry);
  const iconType = getFlatFileDataSourceIcon(relatedSource);
  const value = entry.id;
  const fqn = `main.${toDuckDBIdentifier(relatedSource.viewName)}`;

  // Get columns metadata if enabled
  const getFileColumns = (
    viewName: string,
    databaseMetadata?: Map<string, DataBaseModel>,
  ): DBColumn[] | null => {
    if (!databaseMetadata) return null;

    const pondpilotDB = databaseMetadata.get(PERSISTENT_DB_NAME);
    if (!pondpilotDB) return null;

    const mainSchema = pondpilotDB.schemas.find((s) => s.name === 'main');
    if (!mainSchema) return null;

    const fileView = mainSchema.objects.find((obj) => obj.type === 'view' && obj.name === viewName);

    return fileView?.columns || null;
  };

  let children: TreeNodeData<DataExplorerNodeTypeMap>[] | undefined;
  const columns = options?.showColumns
    ? getFileColumns(relatedSource.viewName, options.databaseMetadata)
    : null;

  if (columns && columns.length > 0) {
    children = columns
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((column) => buildFileColumnTreeNode(column, entry.id, context));
  }

  nodeMap.set(value, { entryId: entry.id, isSheet: false, sheetName: null });
  anyNodeIdToNodeTypeMap.set(value, 'file');

  // Build context menu items
  const contextMenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [
    {
      label: 'Copy Full Name',
      onClick: () => {
        copyToClipboard(fqn, { showNotification: true });
      },
      onAlt: {
        label: 'Copy Name',
        onClick: () => {
          copyToClipboard(toDuckDBIdentifier(relatedSource.viewName), {
            showNotification: true,
          });
        },
      },
    },
    {
      label: 'Create a Query',
      onClick: () => {
        const query = `SELECT * FROM ${fqn};`;
        const newScript = createSQLScript(`${relatedSource.viewName}_query`, query);
        getOrCreateTabFromScript(newScript, true);
      },
    },
    {
      label: 'Show Schema',
      onClick: () => {
        getOrCreateSchemaBrowserTab({
          sourceId: relatedSource.id,
          sourceType: 'file',
          setActive: true,
        });
      },
    },
  ];

  // Add "Toggle columns" if columns are available
  if (children && children.length > 0) {
    contextMenuItems.push({
      label: 'Toggle columns',
      onClick: (node: any, tree: any) => tree.toggleExpanded(node.value),
    });
  }

  return {
    nodeType: 'file',
    value,
    label,
    iconType,
    isDisabled: false,
    isSelectable: true,
    doNotExpandOnClick: true, // Only expand via context menu or Alt+Click
    renameCallbacks: {
      prepareRenameValue: () => relatedSource.viewName,
      validateRename: (node, newName) => validateFileRename(node, newName, flatFileSourcesValues),
      onRenameSubmit: (_, newName) => onFileRenameSubmit(newName, relatedSource),
    },
    onDelete: entry.userAdded
      ? // Only allow deleting explicitly user-added files
        () => {
          deleteDataSources(conn, [relatedSource.id]);
        }
      : undefined,
    onNodeClick: (_node: any, _tree: any): void => {
      // Check if the tab is already open
      const existingTab = findTabFromFlatFileDataSource(relatedSource.id);
      if (existingTab) {
        // If the tab is already open, just set as active and do not change preview
        setActiveTabId(existingTab.id);
        return;
      }

      // Net new. Create an active tab
      const tab = getOrCreateTabFromFlatFileDataSource(relatedSource.id, true);
      // Then set as & preview
      setPreviewTabId(tab.id);
    },
    onCloseItemClick: (): void => {
      deleteTabByDataSourceId(relatedSource.id);
    },
    children,
    contextMenu: [
      {
        children: contextMenuItems,
      },
    ],
  };
}

/**
 * Builds a database file node that appears in the file explorer but cannot be expanded
 *
 * Features:
 * - Shows database files (.duckdb) in the file explorer when part of a folder
 * - Non-expandable with grayed out and italic styling
 * - Tooltip indicates database is available in Local Databases section
 * - Deletion support for user-added database files
 *
 * @param entry - LocalEntry representing the database file
 * @param context - Builder context with connection and data maps
 * @returns TreeNodeData configured as a non-expandable database file
 */
export function buildDatabaseFileNode(
  entry: LocalEntry,
  context: FileSystemBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { nodeMap, anyNodeIdToNodeTypeMap } = context;

  // Type guard to ensure entry is a file
  if (entry.kind !== 'file') {
    throw new Error('Entry must be a file');
  }

  nodeMap.set(entry.id, { entryId: entry.id, isSheet: false, sheetName: null });
  anyNodeIdToNodeTypeMap.set(entry.id, 'file');

  return {
    nodeType: 'file',
    value: entry.id,
    label: `[DB] ${entry.uniqueAlias}`, // Special prefix to identify database files
    iconType: 'db',
    isDisabled: false,
    isSelectable: false,
    doNotExpandOnClick: true,
    onDelete: undefined, // No delete option for database files
    contextMenu: [], // No context menu for database files
    tooltip: 'Find in the Local Databases section',
  };
}
