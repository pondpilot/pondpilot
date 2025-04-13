import { IconType } from '@components/list-view-icon';
import {
  RenderTreeNodePayload as MantineRenderTreeNodePayload,
  TreeNodeData as MantineTreeNodeData,
} from '@mantine/core';

type TreeNodeRenameCallbacks<NType> = {
  /**
   * Callback that should check if the new name is valid.
   *
   * @param node - passes back the node to allow non-closure callbacks
   * @param newName - the new name to check
   * @returns null if the name is valid, or a user-friendly error message if it is not
   */
  validateRename: (node: NType, newName: string) => string | null;

  /**
   * Callback that should be called when the user submits a new, valid name.
   *
   * @param node - passes back the node to allow non-closure callbacks
   * @param newName - the new name to set
   */
  onRenameSubmit: (node: NType, newName: string) => void;

  /**
   * Callback that should be called when the user initiates a rename.
   *
   * If not set, the label of the node will be used as the initial value.
   *
   * @param node - passes back the node to allow non-closure callbacks
   */
  prepareRenameValue?: (node: NType) => string;
};

export type TreeNodeData<NTypeToIdTypeMap extends Record<string, string>> =
  keyof NTypeToIdTypeMap extends infer NType
    ? NType extends keyof NTypeToIdTypeMap
      ? {
          readonly nodeType: NType;

          /**
           * Unique identifier for the item. This is called `value` because Mantine uses
           * this name and we can't change it.
           */
          value: NTypeToIdTypeMap[NType];

          /**
           * The label to display for the item.
           */
          label: string;

          /**
           * Item icon
           */
          iconType: IconType;

          /**
           * If set to true, this item will be rendered as disabled, i.e.
           * it will not be clickable and will have a different style
           * to indicate that it is disabled.
           */
          isDisabled: boolean;

          /**
           * If set to false, this item will not be selectable individually on click.
           * It is still possible to select it as part of multi-select!
           * And expanding/collapsing will still work.
           *
           * Useful for folders.
           */
          isSelectable: boolean;

          /**
           * Callback that should be called when the user clicks on the item,
           * and additional behavior is expected.
           *
           * @param node - passes back the node to allow non-closure callbacks
           */
          onNodeClick?: (node: TreeNodeData<NTypeToIdTypeMap>) => void;

          /**
           * If present, this item will allow renaming.
           *
           * The necessary menu items will be added automatically.
           */
          renameCallbacks?: TreeNodeRenameCallbacks<TreeNodeData<NTypeToIdTypeMap>>;

          /**
           * Callback that should be called when the user requests the deletion of the item.
           *
           * If present, this item will allow deleting.
           *
           * The necessary menu items will be added automatically.
           *
           * @param node - passes back the node to allow non-closure callbacks
           */
          onDelete?: (node: TreeNodeData<NTypeToIdTypeMap>) => void;

          /**
           * Callback that should be called when the user requests to close the item.
           *
           * If present, this item will show a close button when selected (active).
           *
           * @param node - passes back the node to allow non-closure callbacks
           */
          onCloseItemClick?: (node: TreeNodeData<NTypeToIdTypeMap>) => void;

          /**
           * Custom context menu items to add to the item.
           *
           * Note that all sections from this menu will be added on top of the
           * default menu items provided by the `BaseTreeNode` and `ExplorerTree` components.
           * See `renameCallbacks` and `deleteCallbacks` for more information about
           * item level default menu items.
           */
          contextMenu: TreeMenu<TreeNodeData<NTypeToIdTypeMap>>;

          children?: TreeNodeData<NTypeToIdTypeMap>[];
        } & MantineTreeNodeData
      : never
    : never;

/**
 * These are props of the inner BaseTreeNode component.
 *
 * Users are expected to create a wrapper around this component
 * that provides the props that can't be obtained from the `RenderTreeNodePayload`
 * (like `activeItemId`, `dataTestIdPrefix`, etc). below.
 *
 * This is used in lieu of passing hook functions to get ativeItemId into the BaseTreeNode
 * directly, which is apparently ot a react best practice.
 */
export type BaseTreeNodeProps<NTypeToIdTypeMap extends Record<string, string>> =
  keyof NTypeToIdTypeMap extends infer NType
    ? NType extends keyof NTypeToIdTypeMap
      ? {
          node: TreeNodeData<NTypeToIdTypeMap>;

          /**
           * This should be passed by an enclosing component that gets it from
           * the state. It is used to determine if the item is implicitly selected
           * by the virtue of a tab related to this item being active.
           *
           * This can't be passed as NodeData, because it must be reactive.
           */
          isActive: boolean;
          isPrevActive: boolean;
          isNextActive: boolean;

          /**
           * Used to construct the data-testid for the tree node. The resulting data-testid
           * of various component items will have the following prefix:
           * `${dataTestIdPrefix}-tree-item-${itemId}`. The top level node will have
           * `${dataTestIdPrefix}-tree-item-${itemId}-node`.
           */
          dataTestIdPrefix: string;

          /**
           * If not null, it will be used instead of the per-item context menu.
           *
           * This is used by the `ExplorerTree` component to modify context menu
           * on multi-select.
           */
          overrideContextMenu: TreeMenu<TreeNodeData<NTypeToIdTypeMap>> | null;

          /**
           * The itemIds list in the order they are displayed in the tree,
           * ignoring the tree structure.
           */
          flattenedNodeIds: NTypeToIdTypeMap[NType][];
        } & MantineRenderTreeNodePayload
      : never
    : never;

type MenuItemChildren<NType> = {
  label: string;
  isDisabled?: boolean;
  onClick: (node: NType) => void;
};

export type TreeMenuSection<NType> = {
  children: MenuItemChildren<NType>[];
};

export type TreeMenu<NType> = TreeMenuSection<NType>[];

export type RenderTreeNodePayload<
  NTypeToIdTypeMap extends Record<string, string>,
  ExtraT = undefined,
> = keyof NTypeToIdTypeMap extends infer NType
  ? NType extends keyof NTypeToIdTypeMap
    ? {
        node: TreeNodeData<NTypeToIdTypeMap>;

        /**
         * Used to construct the data-testid for the tree node. The resulting data-testid
         * of various component items will have the following prefix:
         * `${dataTestIdPrefix}-tree-item-${itemId}`. The top level node will have this
         * data-testid exactly.
         */
        dataTestIdPrefix: string;

        /**
         * If not null, it will be used instead of the per-item context menu.
         *
         * This is used by the `ExplorerTree` component to modify context menu
         * on multi-select.
         */
        overrideContextMenu: TreeMenu<TreeNodeData<NTypeToIdTypeMap>> | null;

        /**
         * The itemIds list in the order they are displayed in the tree,
         * ignoring the tree structure.
         */
        flattenedNodeIds: NTypeToIdTypeMap[NType][];
      } & MantineRenderTreeNodePayload &
        (ExtraT extends undefined ? {} : { extraData: ExtraT })
    : never
  : never;
