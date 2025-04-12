import { TreeMenu } from '../model';

export function mergeMenus<NTypeToIdTypeMap extends Record<string, any>>(
  menus: TreeMenu<NTypeToIdTypeMap>[],
): TreeMenu<NTypeToIdTypeMap> {
  return menus.flatMap((menu) => menu.map((section) => section));
}
