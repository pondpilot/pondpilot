import { matchSorter } from 'match-sorter';
import { SCRIPT_GROUP_DISPLAY_NAME, SEARCH_PREFIXES, SEARCH_SUFFIXES } from './consts';
import { SpotlightView } from './model';

export const getSpotlightSearchPlaceholder = (spotlightView: SpotlightView) => {
  switch (spotlightView) {
    case 'dataSources':
      return 'Search data sources';
    case 'scripts':
      return 'Search queries';
    default:
      return 'Search or go to...';
  }
};

export const getBreadcrumbText = (view: SpotlightView) =>
  ({
    dataSources: 'Data Sources',
    scripts: SCRIPT_GROUP_DISPLAY_NAME,
    home: 'Home',
  })[view];

export const filterActions = (actions: any[], searchValue: string) => {
  const searchTerm = getSearchTermFromValue(searchValue);

  if (!searchTerm) return actions;

  return matchSorter(actions, searchTerm, {
    keys: ['label'],
  });
};

/**
 * We support various prefixes and suffixes for the search value,
 * see SEARCH_PREFIXES & SEARCH_SUFFIXES in consts.ts.
 *
 * This function will strip them and return the text.
 */
export const getSearchTermFromValue = (searchValue: string) => {
  let text = searchValue.trim();
  if (Object.values(SEARCH_PREFIXES).some((pre) => text.startsWith(pre))) {
    text = text.slice(1);
  }
  if (Object.values(SEARCH_SUFFIXES).some((suf) => text.endsWith(suf))) {
    text = text.slice(0, -1);
  }
  return text;
};
