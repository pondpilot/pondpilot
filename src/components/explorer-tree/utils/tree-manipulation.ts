import { TreeNodeData } from '@components/explorer-tree/model';

export const getFlattenNodes = <NTypeToIdTypeMap extends Record<string, any>>(
  tree: TreeNodeData<NTypeToIdTypeMap>[],
): TreeNodeData<NTypeToIdTypeMap>[] =>
  tree.reduce((acc: TreeNodeData<NTypeToIdTypeMap>[], item) => {
    acc.push(item);
    if (item.children) {
      acc.push(...getFlattenNodes(item.children));
    }
    return acc;
  }, []);
