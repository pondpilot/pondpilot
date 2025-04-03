import { TreeItem } from '../models';

/**
 * Flattens a nested tree structure into a single-level array
 * @param items - Hierarchical tree items to flatten
 * @returns Flattened array of tree items preserving order
 */
export const flattenTreeItems = (items: TreeItem[]): TreeItem[] =>
  items.reduce((acc: TreeItem[], item) => {
    acc.push(item);
    if (item.children && item.children.length > 0) {
      acc.push(...flattenTreeItems(item.children));
    }
    return acc;
  }, []);
