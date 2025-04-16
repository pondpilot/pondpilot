import { TreeNodeMenuType } from '../model';

export function mergeMenus<NTypeToIdTypeMap extends Record<string, any>>(
  menus: TreeNodeMenuType<NTypeToIdTypeMap>[],
): TreeNodeMenuType<NTypeToIdTypeMap> {
  return menus.flatMap((menu) => menu.map((section) => section));
}
