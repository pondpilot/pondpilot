import { AnyTab, TabId } from '@models/tab';

import { makeIdFactory } from './new-id';

export const makeTabId = makeIdFactory<TabId>();

export function ensureTab(tabOrId: AnyTab | TabId, tabs: Map<TabId, AnyTab>): AnyTab {
  // Get the tab object if not passed as an object
  if (typeof tabOrId === 'string') {
    const fromState = tabs.get(tabOrId);

    if (!fromState) {
      throw new Error(`Tab with id ${tabOrId} not found`);
    }

    return fromState;
  }

  return tabOrId;
}
