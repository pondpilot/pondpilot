import { TabId } from '@models/tab';
import { makeIdFactory } from './new-id';

export const makeTabId = makeIdFactory<TabId>();
