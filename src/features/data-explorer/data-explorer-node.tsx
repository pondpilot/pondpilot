import { MemoizedBaseTreeNode } from '@components/explorer-tree/components/tree-node';
import { RenderTreeNodePayload } from '@components/explorer-tree/model';
import { useDataSourceIdForActiveTab, useIsLocalDBElementOnActiveTab } from '@store/app-store';
import type { DragEvent } from 'react';

import { DataExplorerNodeTypeMap, DataExplorerContext } from './model';
import { DATASET_DND_MIME_TYPE } from '../../constants/dnd';

const attachDragImage = (
  event: DragEvent<HTMLDivElement>,
  iconContainer: HTMLElement | null,
  label: string,
) => {
  const isDarkMode = document.documentElement.classList.contains('dark');

  // Outer wrapper for proper positioning
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '-1000px';
  wrapper.style.left = '-1000px';
  wrapper.style.pointerEvents = 'none';

  // Inner pill-shaped container
  const dragGhost = document.createElement('div');
  dragGhost.style.display = 'flex';
  dragGhost.style.alignItems = 'center';
  dragGhost.style.justifyContent = 'center';
  dragGhost.style.gap = '8px';
  dragGhost.style.padding = '6px 12px';
  dragGhost.style.borderRadius = '100px';
  dragGhost.style.background = isDarkMode ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.95)';
  dragGhost.style.backdropFilter = 'blur(14px)';
  dragGhost.style.setProperty('-webkit-backdrop-filter', 'blur(14px)');
  dragGhost.style.color = isDarkMode ? '#e2e8f0' : '#334155';
  dragGhost.style.fontSize = '13px';
  dragGhost.style.fontWeight = '500';
  dragGhost.style.lineHeight = '18px';
  dragGhost.style.boxShadow = isDarkMode
    ? '0 10px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
    : '0 10px 24px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)';
  dragGhost.style.minHeight = '28px';
  dragGhost.style.pointerEvents = 'none';

  const iconWrapper = document.createElement('span');
  iconWrapper.style.display = 'flex';
  iconWrapper.style.alignItems = 'center';
  iconWrapper.style.justifyContent = 'center';
  iconWrapper.style.width = '18px';
  iconWrapper.style.height = '18px';
  iconWrapper.style.pointerEvents = 'none';
  iconWrapper.style.color = dragGhost.style.color;

  let appendedIcon = false;
  if (iconContainer) {
    const existingSvg = iconContainer.querySelector('svg');
    if (existingSvg) {
      const svgClone = existingSvg.cloneNode(true) as SVGElement;
      svgClone.setAttribute('width', '18');
      svgClone.setAttribute('height', '18');
      svgClone.style.margin = '0';
      svgClone.style.display = 'block';
      iconWrapper.appendChild(svgClone);
      appendedIcon = true;
    }
  }

  if (!appendedIcon) {
    iconWrapper.textContent = '📊';
    iconWrapper.style.fontSize = '16px';
  }

  dragGhost.appendChild(iconWrapper);

  const labelNode = document.createElement('span');
  labelNode.textContent = label;
  labelNode.style.whiteSpace = 'nowrap';
  labelNode.style.pointerEvents = 'none';
  dragGhost.appendChild(labelNode);

  wrapper.appendChild(dragGhost);
  document.body.appendChild(wrapper);

  // Force a layout/paint cycle to ensure border-radius is applied
  dragGhost.offsetHeight;

  const { width, height } = dragGhost.getBoundingClientRect();
  event.dataTransfer.setDragImage(dragGhost, width / 2, height / 2);

  requestAnimationFrame(() => {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  });
};

// Reusable tree node component for the data explorer
export const DataExplorerNode = (
  props: RenderTreeNodePayload<DataExplorerNodeTypeMap, DataExplorerContext>,
) => {
  const { node, tree, flattenedNodeIds, extraData } = props;
  const { value: itemId } = node;

  // Get active data source ID for file system nodes
  const activeDataSourceId = useDataSourceIdForActiveTab();

  // Find the current node index in the flattened list
  const curNodeIndex = flattenedNodeIds.findIndex((id) => id === itemId);
  const prevNodeId = curNodeIndex > 0 ? flattenedNodeIds[curNodeIndex - 1] : null;
  const nextNodeId =
    curNodeIndex < flattenedNodeIds.length - 1 ? flattenedNodeIds[curNodeIndex + 1] : null;

  // Check if this is the first or last node in the current tree section
  const isFirstInSection = curNodeIndex === 0;
  const isLastInSection = curNodeIndex === flattenedNodeIds.length - 1;

  // Get node info from the node map
  const nodeInfo = extraData.nodeMap.get(itemId);

  // Get database node info for current, prev and next nodes
  const dbNodeInfo = nodeInfo && 'db' in nodeInfo ? nodeInfo : null;
  const prevNodeInfo = prevNodeId ? extraData.nodeMap.get(prevNodeId) : null;
  const nextNodeInfo = nextNodeId ? extraData.nodeMap.get(nextNodeId) : null;
  const prevDbNodeInfo = prevNodeInfo && 'db' in prevNodeInfo ? prevNodeInfo : null;
  const nextDbNodeInfo = nextNodeInfo && 'db' in nextNodeInfo ? nextNodeInfo : null;

  // Call hooks unconditionally (with null values when not applicable)
  const isDbNodeActive = useIsLocalDBElementOnActiveTab(
    dbNodeInfo?.db || null,
    dbNodeInfo?.schemaName || null,
    dbNodeInfo?.objectName || null,
    dbNodeInfo?.columnName || null,
  );

  const isPrevDbNodeActive = useIsLocalDBElementOnActiveTab(
    prevDbNodeInfo?.db || null,
    prevDbNodeInfo?.schemaName || null,
    prevDbNodeInfo?.objectName || null,
    prevDbNodeInfo?.columnName || null,
  );

  const isNextDbNodeActive = useIsLocalDBElementOnActiveTab(
    nextDbNodeInfo?.db || null,
    nextDbNodeInfo?.schemaName || null,
    nextDbNodeInfo?.objectName || null,
    nextDbNodeInfo?.columnName || null,
  );

  // Determine active states based on node type
  let isActive = false;
  let isPrevActive = false;
  let isNextActive = false;

  if (node.nodeType === 'file' || node.nodeType === 'sheet') {
    // Handle file system nodes
    isActive = itemId === activeDataSourceId;
    isPrevActive = prevNodeId === activeDataSourceId;
    isNextActive = nextNodeId === activeDataSourceId;
  } else if (dbNodeInfo) {
    // Handle database nodes
    isActive = isDbNodeActive;
    isPrevActive = isPrevDbNodeActive;
    isNextActive = isNextDbNodeActive;
  }

  // Get override context menu from extraData if it exists
  const overrideContextMenu =
    tree.selectedState.length > 1 ? extraData.getOverrideContextMenu(tree.selectedState) : null;

  const comparisonSource = extraData.getComparisonSourceForNode(itemId);
  const canDrag = Boolean(comparisonSource);

  const originalOnDragStart = (props.elementProps as Record<string, unknown> | undefined)
    ?.onDragStart;

  const enhancedElementProps = {
    ...props.elementProps,
    ...(canDrag
      ? {
          draggable: true,
          onDragStart: (event: DragEvent<HTMLDivElement>) => {
            if (comparisonSource) {
              event.dataTransfer.setData(DATASET_DND_MIME_TYPE, JSON.stringify(comparisonSource));
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData('text/plain', node.label);
              const iconElement = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
                '[data-dnd-drag-icon]',
              );
              attachDragImage(event, iconElement, node.label);
            } else {
              event.preventDefault();
            }
            if (typeof originalOnDragStart === 'function') {
              (originalOnDragStart as (event: DragEvent<HTMLDivElement>) => void)(event);
            }
          },
        }
      : {}),
  };

  // Adjust active state propagation for section boundaries
  // Don't remove border radius if we're at a section boundary
  const adjustedPrevActive = isFirstInSection ? false : isPrevActive;
  const adjustedNextActive = isLastInSection ? false : isNextActive;

  return (
    <MemoizedBaseTreeNode<DataExplorerNodeTypeMap>
      {...props}
      elementProps={enhancedElementProps}
      isActive={isActive}
      isPrevActive={adjustedPrevActive}
      isNextActive={adjustedNextActive}
      overrideContextMenu={overrideContextMenu}
    />
  );
};

DataExplorerNode.displayName = 'DataExplorerNode';
