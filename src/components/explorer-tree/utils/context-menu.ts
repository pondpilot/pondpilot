import { TreeNodeMenuType } from '../model';

export function mergeMenus<NTypeToIdTypeMap extends Record<string, any>>(
  menus: TreeNodeMenuType<NTypeToIdTypeMap>[],
): TreeNodeMenuType<NTypeToIdTypeMap> {
  return menus.flatMap((menu) => menu.map((section) => section));
}

export function getMenuItemDataTestId(
  dataTestIdPrefix: string,
  menuItemLabel: string,
  menuItemIndex: number,
): string {
  // Replace whitespace with dashes, remove special characters from the label and convert to lowercase
  const sanitizedLabel = menuItemLabel
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${dataTestIdPrefix}-context-menu-item-${menuItemIndex}-${sanitizedLabel}`;
}
