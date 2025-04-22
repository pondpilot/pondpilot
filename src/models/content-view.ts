import { TabId } from './tab';

/**
 * Represents the content view related part of the app state.
 */
export type ContentViewState = {
  /**
   * The id of the currently active tab, or null if no tab is active.
   *
   * Invariant: id should always be present in the tabs map.
   */
  activeTabId: TabId | null;

  /**
   * The identifier of the tab currently in preview mode, or null if there is none.
   *
   * Invariant: id should always be present in the tabs map.
   */
  previewTabId: TabId | null;

  /**
   * An array of TabId's in the order they should be displayed.
   *
   * Invariant: all TabId's in this array should be present in the tabs map.
   */
  tabOrder: TabId[];
};

/**
 * Represents the presisted model of the content view state.
 *
 * Our iDB interface is responsible for converting the state to and from.
 */
export type ContentViewPersistence = ContentViewState;
