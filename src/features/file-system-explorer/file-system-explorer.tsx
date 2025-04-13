import { MenuItem, SourcesListView, TypedTreeNodeData } from '@components/sources-list-view';
import { useClipboard } from '@mantine/hooks';
import { memo, useMemo } from 'react';
import { useAppNotifications } from '@components/app-notifications';
import {
  createSQLScript,
  deleteDataSource,
  deleteTabByDataSourceId,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromScript,
  useDataSourceIdForActiveTab,
  useAppStore,
} from '@store/app-store';
import { LocalEntryId } from '@models/file-system';
import { AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import { getDataSourceIcon, getFlatFileDataSourceName, getlocalEntryIcon } from '@utils/navigation';
import { useInitializedDuckDBConnection } from '@features/duckdb-context/duckdb-context';

/**
 * Displays a file system tree for all registered local entities (files & folders)
 * except databases, which are intentionally separated into DB Explorer
 */
export const FileSystemExplorer = memo(() => {
  /**
   * Common hooks
   */
  const { copy } = useClipboard();
  const { showSuccess } = useAppNotifications();
  const activeDataSourceId = useDataSourceIdForActiveTab();
  const { db, conn } = useInitializedDuckDBConnection();

  /**
   * Store access
   */
  const entries = useAppStore.use.localEntries();
  const sources = useAppStore.use.dataSources();
  const dataSourceByFileId: Map<LocalEntryId, AnyFlatFileDataSource> = useMemo(
    () =>
      new Map(
        sources
          .values()
          .filter((source) => source.type !== 'attached-db')
          .map((source) => [source.fileSourceId, source]),
      ),
    [sources],
  );

  /**
   * Calculate views to display by doing a depth-first traversal of the entries tree
   */
  const viewsToDisplay = useMemo(() => {
    const buildTree = (parentId: LocalEntryId | null): TypedTreeNodeData[] => {
      const children: TypedTreeNodeData[] = [];

      // TODO: avoid forEach to decrease complexity
      entries.forEach((entry) => {
        if (entry.parentId !== parentId) return;

        if (entry.kind === 'directory') {
          children.push({
            value: entry.id,
            label: entry.uniqueAlias,
            iconType: getlocalEntryIcon(entry),
            children: buildTree(entry.id),
          });
          return;
        }

        const relatedSource = dataSourceByFileId.get(entry.id);

        if (!relatedSource) {
          return;
        }
        const label = getFlatFileDataSourceName(relatedSource, entry);
        const iconType = getDataSourceIcon(relatedSource);
        const value = relatedSource.id;

        const fileNode: TypedTreeNodeData = {
          value,
          label,
          iconType,
          nodeProps: {
            onClick: () => getOrCreateTabFromFlatFileDataSource(value, true),
            onActiveClose: () => deleteTabByDataSourceId(value),
          },
        };

        // This would be needed for multi-view file sources
        // if (relatedSource.length > 0) {
        //   fileNode.children = relatedSource.map((src) => ({
        //     value: src.id,
        //     label: src.displayName,
        //     // TODO: find out how to get the icon type from the file type
        //     iconType: 'csv',
        //   }));

        //   // Sort sources alphabetically
        //   fileNode.children.sort((a, b) => a.label.localeCompare(b.label));
        // }

        children.push(fileNode);
      });

      // Sort (folders first, then alphabetically)
      children.sort((a, b) => {
        const aIsFolder = a.iconType === 'folder';
        const bIsFolder = b.iconType === 'folder';
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return a.label.localeCompare(b.label);
      });

      return children;
    };

    return buildTree(null);
  }, [entries, dataSourceByFileId, activeDataSourceId]);

  /**
   * Consts
   */

  const handleDeleteSelected = async (items: string[]) => {
    deleteDataSource(db, conn, items as PersistentDataSourceId[]);
  };

  const menuItems: MenuItem[] = [
    {
      children: [
        {
          label: 'Create a query',
          onClick: (item) => {
            const newScript = createSQLScript(
              `${item.label}_query`,
              `SELECT * FROM ${item.label};`,
            );
            getOrCreateTabFromScript(newScript, true);
          },
        },
      ],
    },
    {
      children: [
        {
          label: 'Copy name',
          onClick: (item) => {
            copy(item.label);
            showSuccess({ title: 'Copied', message: '', autoClose: 800 });
          },
        },
      ],
    },
    {
      children: [
        {
          label: 'Delete',
          onClick: (item) => deleteDataSource(db, conn, [item.value as PersistentDataSourceId]),
        },
      ],
    },
  ];

  return (
    <SourcesListView
      parentDataTestId="view-explorer"
      list={viewsToDisplay}
      onDeleteSelected={handleDeleteSelected}
      menuItems={menuItems}
      activeItemKey={activeDataSourceId}
    />
  );
});
