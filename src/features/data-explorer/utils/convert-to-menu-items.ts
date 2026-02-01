import { TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import { exportFormatRegistry } from '@models/export-format-registry';
import { ExportFormat } from '@models/export-options';
import { TabId } from '@models/tab';
import { setPendingConvert } from '@store/app-store';

import { DataExplorerNodeTypeMap } from '../model';

type MenuItem = TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>;

/**
 * Builds "Convert To" context menu items from the format registry.
 * The submenu lists all export formats, optionally filtering out the source format
 * (for flat files where converting to the same format doesn't make sense).
 *
 * @param getOrCreateTab - Callback that opens/focuses the tab and returns its ID
 * @param sourceFormat - The current format of the source (null for DB objects to show all formats)
 */
export function buildConvertToMenuItems(
  getOrCreateTab: () => TabId,
  sourceFormat: ExportFormat | null,
): MenuItem[] {
  const submenu: MenuItem[] = exportFormatRegistry
    .filter((def) => def.key !== sourceFormat)
    .map((def) => ({
      label: def.label,
      onClick: () => {
        const tabId = getOrCreateTab();
        setPendingConvert(tabId, def.key);
      },
    }));

  if (submenu.length === 0) {
    return [];
  }

  return [
    {
      label: 'Convert To',
      onClick: () => {},
      submenu,
    },
  ];
}
