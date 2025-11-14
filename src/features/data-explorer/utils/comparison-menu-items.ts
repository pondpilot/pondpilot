import { TreeNodeData, TreeNodeMenuItemType } from '@components/explorer-tree';
import {
  createComparisonWithInitialSource,
  hasActiveComparisonTab,
  setActiveComparisonSource,
} from '@controllers/tab/comparison-tab-controller';
import { ComparisonSource } from '@models/comparison';

import { DataExplorerNodeTypeMap } from '../model';

type MenuItem = TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>;

/**
 * Builds comparison-related context menu items for a given dataset node.
 * The `getSource` callback is evaluated lazily so menu visibility is accurate
 * even when called repeatedly during render interactions.
 */
export const buildComparisonMenuItems = (getSource: () => ComparisonSource | null): MenuItem[] => {
  const hasActiveComparison = () => hasActiveComparisonTab();

  const buildSubmenuItem = (
    label: string,
    handler: (source: ComparisonSource) => void,
    shouldShow: () => boolean,
  ): MenuItem => ({
    label,
    onClick: () => {
      const source = getSource();
      if (!source) {
        return;
      }
      handler(source);
    },
    isHidden: () => {
      const source = getSource();
      if (!source) {
        return true;
      }
      return !shouldShow();
    },
  });

  const submenu: MenuItem[] = [
    buildSubmenuItem(
      'Set as Source A',
      (source) => {
        setActiveComparisonSource('A', source);
      },
      () => hasActiveComparison(),
    ),
    buildSubmenuItem(
      'Set as Source B',
      (source) => {
        setActiveComparisonSource('B', source);
      },
      () => hasActiveComparison(),
    ),
    buildSubmenuItem(
      'Add to Comparison',
      (source) => {
        createComparisonWithInitialSource(source);
      },
      () => !hasActiveComparison(),
    ),
  ];

  return [
    {
      label: 'Comparison',
      onClick: () => {},
      isHidden: () => !getSource(),
      submenu,
    },
  ];
};
