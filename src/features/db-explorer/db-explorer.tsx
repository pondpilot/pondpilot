import { MenuItem } from '@components/sources-list-view';
import { memo } from 'react';
import { useClipboard } from '@mantine/hooks';
import { useAppNotifications } from '@components/app-notifications';
import {
  createSQLScript,
  deleteDataSource,
  getOrCreateTabFromScript,
  useAttachedDBNameMap,
  useAppStore,
} from '@store/app-store';
import { ExplorerTree } from '@components/sources-list-view/explorer-tree';
import { TreeMenu, TreeNodeData } from '@components/sources-list-view/model';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';
import { DBExplorerNodeExtraType, DBExplorerNodeTypeToIdTypeMap } from './model';
import { DbExplorerNode } from './db-explorer-node';

/**
 * Displays attached databases and their schemas/tables/columns
 */
export const DbExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { copy } = useClipboard();
  const { showSuccess } = useAppNotifications();
  const { db, conn } = useInitializedDuckDBConnection();

  /**
   * Store access
   */
  const attachedDBNameMap = useAttachedDBNameMap();
  const dataBaseMetadata = useAppStore.use.dataBaseMetadata();

  /**
   * Local state
   */
  const nodeIdsToFQNMap: DBExplorerNodeExtraType = new Map();

  /**
   * Consts
   */
  const dbContextMenu: TreeMenu<TreeNodeData<DBExplorerNodeTypeToIdTypeMap>> = [
    {
      children: [
        {
          label: 'Copy name',
          onClick: (dbNode) => {
            copy(dbNode.label);
            showSuccess({ title: 'Copied', message: '', autoClose: 800 });
          },
        },
      ],
    },
  ];

  const sortedDBIdsAndNames = Array.from(attachedDBNameMap).sort(([, a], [, b]) =>
    a.localeCompare(b),
  );

  const dbObjectsTree: TreeNodeData<DBExplorerNodeTypeToIdTypeMap>[] = sortedDBIdsAndNames.map(
    ([dbId, dbName]) => {
      nodeIdsToFQNMap.set(dbId, { db: dbId, schemaName: null, objectName: null, columnName: null });

      const sortedSchemas = dataBaseMetadata
        .get(dbId)
        ?.schemas?.sort((a, b) => a.name.localeCompare(b.name));

      return {
        nodeType: 'db',
        value: dbId,
        label: dbName,
        iconType: 'db',
        isDisabled: false,
        isSelectable: false,
        // TODO: implement renaming of database aliases
        renameCallbacks: {
          validateRename: () => {
            throw new Error('TODO: implement renaming of database aliases');
          },
          onRenameSubmit: () => {
            throw new Error('TODO: implement renaming of database aliases');
          },
        },
        onDelete: (node: TreeNodeData<DBExplorerNodeTypeToIdTypeMap>): void => {
          if (node.nodeType === 'db') {
            deleteDataSource(db, conn, [node.value]);
          }
        },
        contextMenu: dbContextMenu,
        // children: sortedSchemas?.map((schema) => ({
        //   value: `${item.name}/${schema.name}`,
        //   nodeProps: {
        //     id: 'schema',
        //   },
        //   iconType: 'db-schema',
        //   label: schema.name,
        //   children: schema.tables?.map((table) => ({
        //     value: `${item.name}/${schema.name}/${table.name}`,
        //     label: table.name,
        //     iconType: 'db-table',
        //     nodeProps: {
        //       id: 'table',
        //     },
        //   })),
        // })),
      };
    },
  );

  const handleDeleteSelected = async (items: string[]) => {};

  const menuItems: MenuItem[] = [
    {
      children: [
        {
          label: 'Copy name',
          onClick: (item) => {
            copy(item.label);
            showSuccess({ message: 'Copied', autoClose: 800 });
          },
        },
        {
          label: 'Create a query',
          onClick: (item) => {
            const isDB = item.value.split('/').length === 1;
            const query = isDB
              ? `SELECT * FROM ${item.label}.data;`
              : `SELECT * FROM ${item.value.replaceAll('/', '.')};`;

            const newScript = createSQLScript(`${item.label}_query`, query);
            getOrCreateTabFromScript(newScript, true);
          },
        },
      ],
    },
  ];
  return (
    <ExplorerTree<DBExplorerNodeTypeToIdTypeMap, DBExplorerNodeExtraType>
      nodes={dbObjectsTree}
      extraData={nodeIdsToFQNMap}
      dataTestIdPrefix="db-explorer"
      TreeNodeComponent={DbExplorerNode}
      onDeleteSelected={handleDeleteSelected}
    />
  );
});
