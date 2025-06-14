import { TextInput, Popover } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';

import { TreeNodeData } from '../../model';

interface TreeNodeRenameInputProps<NTypeToIdTypeMap extends Record<string, any>> {
  pendingRenamedValue: string;
  renameInputError: string | null;
  treeNodeDataTestIdPrefix: string;
  node: TreeNodeData<NTypeToIdTypeMap>;
  validateRename: (node: TreeNodeData<NTypeToIdTypeMap>, value: string) => string | null;
  onRenameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRenameKeyDown: (e: React.KeyboardEvent) => void;
  onRenameCancel: () => void;
}

export function TreeNodeRenameInput<NTypeToIdTypeMap extends Record<string, any>>({
  pendingRenamedValue,
  renameInputError,
  treeNodeDataTestIdPrefix,
  // node and validateRename are not used directly but are part of the interface
  node: _node,
  validateRename: _validateRename,
  onRenameChange,
  onRenameKeyDown,
  onRenameCancel,
}: TreeNodeRenameInputProps<NTypeToIdTypeMap>) {
  return (
    <Popover opened={!!renameInputError}>
      <Popover.Target>
        <TextInput
          data-testid={setDataTestId(`${treeNodeDataTestIdPrefix}-rename-input`)}
          value={pendingRenamedValue}
          onChange={onRenameChange}
          onKeyDown={onRenameKeyDown}
          error={!!renameInputError}
          onBlur={onRenameCancel}
          fw={500}
          classNames={{
            input: 'px-3 py-1',
          }}
          size="xs"
          autoFocus
        />
      </Popover.Target>
      <Popover.Dropdown>{renameInputError}</Popover.Dropdown>
    </Popover>
  );
}
