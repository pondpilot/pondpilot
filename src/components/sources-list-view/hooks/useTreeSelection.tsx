import { useCallback } from 'react';
import { TreeNodeData, UseTreeReturnType } from '@mantine/core';
import { flattenTreeItems } from './utils';
import { TreeItem } from '../models';

export interface UseTreeSelectionProps {
  tree: UseTreeReturnType;
  items: TreeItem[];
  activeItemKey: string | null;
  onItemClick?: (value: string) => void;
  disabled?: boolean;
}
export const useTreeSelection = ({
  tree,
  items,
  onItemClick,
  disabled,
  activeItemKey,
}: UseTreeSelectionProps) => {
  const handleTreeItemClick = useCallback(
    (e: React.MouseEvent, node: TreeNodeData) => {
      const { value } = node;
      const selected = tree.selectedState.includes(value);
      const flatList = flattenTreeItems(items);

      // Handle Shift key selection (range selection)
      if (node.nodeProps?.canSelect && e.shiftKey) {
        if (tree.selectedState.length === 0) {
          tree.setSelectedState([value]);
          onItemClick?.(value);
          e.stopPropagation();
          return;
        }

        const selectedIndex = flatList.findIndex((item) => item.value === value);
        const lastSelectedIndex = flatList.findIndex(
          (item) => item.value === tree.selectedState[0],
        );

        if (selectedIndex !== -1 && lastSelectedIndex !== -1) {
          const start = Math.min(selectedIndex, lastSelectedIndex);
          const end = Math.max(selectedIndex, lastSelectedIndex);
          const newSelected = flatList.slice(start, end + 1).map((item) => item.value);

          tree.setSelectedState(newSelected);
          onItemClick?.(value);
          e.stopPropagation();
          return;
        }
      }

      // Handle Ctrl/Cmd key selection (toggle selection)
      if (node.nodeProps?.canSelect && (e.metaKey || e.ctrlKey)) {
        if (selected) {
          tree.deselect(value);
        } else {
          // If activeItemKey exists in flatList but not in selection state, add both it and the clicked value
          const hasValidActiveItem =
            activeItemKey &&
            flatList.some((item) => item.value === activeItemKey) &&
            !tree.selectedState.includes(activeItemKey);

          if (hasValidActiveItem) {
            tree.setSelectedState([...tree.selectedState, activeItemKey, value]);
          } else {
            tree.setSelectedState([...tree.selectedState, value]);
          }
        }
        e.stopPropagation();
        return;
      }

      // Handle regular selection
      if (!disabled) {
        tree.setSelectedState([value]);
        onItemClick?.(value);
      }
    },
    [tree, items, onItemClick, disabled],
  );

  return { handleTreeItemClick };
};
