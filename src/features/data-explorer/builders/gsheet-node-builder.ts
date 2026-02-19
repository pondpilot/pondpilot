import { TreeNodeData } from '@components/explorer-tree';
import { deleteDataSources } from '@controllers/data-source';
import { createSQLScript } from '@controllers/sql-script';
import {
  findTabFromFlatFileDataSource,
  getOrCreateSchemaBrowserTab,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromScript,
  setActiveTabId,
  setPreviewTabId,
  deleteTabByDataSourceId,
} from '@controllers/tab';
import { dataSourceToComparisonSource } from '@features/comparison/utils/source-selection';
import { AsyncDuckDBConnectionPool } from '@features/duckdb-context/duckdb-connection-pool';
import { GSheetSheetView } from '@models/data-source';
import { LocalEntryId } from '@models/file-system';
import { copyToClipboard } from '@utils/clipboard';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';

import { DataExplorerNodeMap, DataExplorerNodeTypeMap } from '../model';
import { buildComparisonMenuItems } from '../utils/comparison-menu-items';
import { buildConvertToMenuItems } from '../utils/convert-to-menu-items';

interface GSheetBuilderContext {
  nodeMap: DataExplorerNodeMap;
  anyNodeIdToNodeTypeMap: Map<string, keyof DataExplorerNodeTypeMap>;
  conn: AsyncDuckDBConnectionPool;
}

function buildGSheetNode(
  sourceGroupId: LocalEntryId,
  sheet: GSheetSheetView,
  context: GSheetBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { nodeMap, anyNodeIdToNodeTypeMap } = context;
  const fqn = `main.${toDuckDBIdentifier(sheet.viewName)}`;

  nodeMap.set(sheet.id, { entryId: sourceGroupId, isSheet: true, sheetName: sheet.sheetName });
  anyNodeIdToNodeTypeMap.set(sheet.id, 'sheet');

  return {
    nodeType: 'sheet',
    value: sheet.id,
    label: sheet.sheetName,
    iconType: 'gsheet-sheet',
    isDisabled: false,
    isSelectable: true,
    onNodeClick: (): void => {
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
          ...buildComparisonMenuItems(() => dataSourceToComparisonSource(sheet)),
          ...buildConvertToMenuItems(() => {
            const existingTab = findTabFromFlatFileDataSource(sheet.id);
            if (existingTab) {
              setActiveTabId(existingTab.id);
              return existingTab.id;
            }
            const tab = getOrCreateTabFromFlatFileDataSource(sheet.id, true);
            setActiveTabId(tab.id);
            return tab.id;
          }, null),
        ],
      },
    ],
  };
}

export function buildGSheetWorkbookNode(
  sourceGroupId: LocalEntryId,
  sheets: GSheetSheetView[],
  context: GSheetBuilderContext,
): TreeNodeData<DataExplorerNodeTypeMap> {
  const { nodeMap, anyNodeIdToNodeTypeMap, conn } = context;
  const sortedSheets = [...sheets].sort((a, b) => a.sheetName.localeCompare(b.sheetName));
  const firstSheet = sortedSheets[0];
  const label = firstSheet?.spreadsheetName || firstSheet?.spreadsheetId || 'Google Sheet';

  nodeMap.set(sourceGroupId, { entryId: null, isSheet: false, sheetName: null });
  anyNodeIdToNodeTypeMap.set(sourceGroupId, 'file');

  return {
    nodeType: 'file',
    value: sourceGroupId,
    label,
    iconType: 'gsheet',
    isDisabled: false,
    isSelectable: false,
    onDelete: () =>
      deleteDataSources(
        conn,
        sortedSheets.map((sheet) => sheet.id),
      ),
    contextMenu: [
      {
        children: [
          {
            label: 'Copy name',
            onClick: () => {
              copyToClipboard(label, { showNotification: true });
            },
          },
          {
            label: 'Open in Google Sheets',
            onClick: () => {
              if (firstSheet?.spreadsheetUrl) {
                window.open(firstSheet.spreadsheetUrl, '_blank', 'noopener,noreferrer');
              }
            },
          },
          {
            label: 'Show Schema',
            onClick: () => {
              getOrCreateSchemaBrowserTab({
                sourceId: null,
                sourceType: 'file',
                objectNames: sortedSheets.map((sheet) => sheet.id),
                setActive: true,
              });
            },
          },
        ],
      },
    ],
    children: sortedSheets.map((sheet) => buildGSheetNode(sourceGroupId, sheet, context)),
  };
}
