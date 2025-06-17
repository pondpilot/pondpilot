import { useState } from 'react';

import { TreeNodeData, TreeNodeMenuType } from '../../model';
import { mergeMenus } from '../../utils/context-menu';

export function useTreeNodeContextMenu<NTypeToIdTypeMap extends Record<string, any>>(
  node: TreeNodeData<NTypeToIdTypeMap>,
  renameCallbacks?: {
    validateRename?: (node: TreeNodeData<NTypeToIdTypeMap>, value: string) => string | null;
    onRenameSubmit?: (node: TreeNodeData<NTypeToIdTypeMap>, value: string) => void;
    prepareRenameValue?: (node: TreeNodeData<NTypeToIdTypeMap>) => string;
  },
  overrideContextMenu?: TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> | null,
  onStartRename?: () => void,
) {
  const { isDisabled, onDelete, contextMenu: customContextMenu } = node;

  const [menuOpened, setMenuOpened] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number | undefined;
    y: number | undefined;
  }>({ x: 0, y: 0 });

  const defaultMenu: TreeNodeMenuType<TreeNodeData<NTypeToIdTypeMap>> = [];

  // Only add rename section if rename is possible
  if (renameCallbacks && !isDisabled && onStartRename) {
    defaultMenu.push({
      children: [
        {
          label: 'Rename',
          onClick: () => onStartRename(),
          isDisabled: false,
        },
      ],
    });
  }

  // Only add delete section if delete is possible
  if (onDelete && !isDisabled) {
    defaultMenu.push({
      children: [
        {
          label: 'Delete',
          onClick: () => onDelete(node),
          isDisabled: false,
        },
      ],
    });
  }

  const contextMenu = overrideContextMenu || mergeMenus([customContextMenu, defaultMenu]);

  const handleOpenMenuButton = (event: React.MouseEvent) => {
    setMenuPosition({ x: undefined, y: undefined });
    event.stopPropagation();
    setMenuOpened(true);
  };

  const handleCloseMenu = () => {
    setMenuOpened(false);
  };

  const handleContextMenuClick = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
    setMenuOpened(true);
  };

  return {
    menuOpened,
    menuPosition,
    contextMenu,
    handleOpenMenuButton,
    handleCloseMenu,
    handleContextMenuClick,
  };
}
