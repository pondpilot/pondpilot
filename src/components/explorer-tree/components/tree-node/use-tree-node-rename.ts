import { useState } from 'react';

import { TreeNodeData } from '../../model';

type RenameState = {
  isRenaming: boolean;
  pendingRenamedValue: string;
  renameInputError: string | null;
};

export function useTreeNodeRename<NTypeToIdTypeMap extends Record<string, any>>(
  node: TreeNodeData<NTypeToIdTypeMap>,
  renameCallbacks?: {
    validateRename?: (node: TreeNodeData<NTypeToIdTypeMap>, value: string) => string | null;
    onRenameSubmit?: (node: TreeNodeData<NTypeToIdTypeMap>, value: string) => void;
    prepareRenameValue?: (node: TreeNodeData<NTypeToIdTypeMap>) => string;
  },
) {
  const { label, isDisabled } = node;
  const { validateRename, onRenameSubmit, prepareRenameValue } = renameCallbacks || {};

  const [renameState, setRenameState] = useState<RenameState>({
    isRenaming: false,
    pendingRenamedValue: label,
    renameInputError: null,
  });

  const handleStartRename = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Check if the item is not disabled, not renaming already, and if the rename callbacks are present
    if (!isDisabled && !renameState.isRenaming && validateRename && onRenameSubmit) {
      setRenameState({
        isRenaming: true,
        pendingRenamedValue: prepareRenameValue?.(node) || label,
        renameInputError: null,
      });
    }
  };

  const handleOnRenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!validateRename) return;

    setRenameState({
      isRenaming: true,
      pendingRenamedValue: e.currentTarget.value,
      renameInputError: validateRename(node, e.currentTarget.value),
    });
  };

  const handleRenameCancel = () => {
    setRenameState({ isRenaming: false, pendingRenamedValue: label, renameInputError: null });
  };

  const handleRenameSubmit = () => {
    if (!validateRename || !onRenameSubmit) return;

    // Double check if the name is valid
    if (validateRename(node, renameState.pendingRenamedValue) === null) {
      setRenameState({
        isRenaming: false,
        pendingRenamedValue: renameState.pendingRenamedValue,
        renameInputError: null,
      });
      onRenameSubmit(node, renameState.pendingRenamedValue);
      return;
    }

    // If we made a mistake and called this with an invalid name,
    // handle as if the user cancelled the rename
    handleRenameCancel();
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !renameState.renameInputError) {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  };

  return {
    ...renameState,
    handleStartRename,
    handleOnRenameChange,
    handleRenameCancel,
    handleRenameSubmit,
    handleRenameKeyDown,
  };
}
