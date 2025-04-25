export const getNodeDataTestIdPrefix = (dataTestIdPrefix: string, nodeId: string): string => {
  return `${dataTestIdPrefix}-tree-node-${nodeId}`;
};
