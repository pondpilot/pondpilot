import { matchSorter } from 'match-sorter';
import { SpotlightView } from './models';

export const getSpotlightSearchPlaceholder = (spotlightView: SpotlightView) => {
  switch (spotlightView) {
    case 'dataSources':
      return 'Search data sources';
    case 'queries':
      return 'Search queries';
    default:
      return 'Search or go to...';
  }
};

export const getBreadcrumbText = (view: SpotlightView) =>
  ({
    dataSources: 'Data Sources',
    queries: 'Queries',
    settings: 'Settings',
    home: 'Home',
    'settings-theme': 'Theme',
  })[view];

export const filterActions = (actions: any[], _searchValue: string) => {
  if (!_searchValue) return actions;

  return matchSorter(actions, _searchValue, {
    keys: ['label'],
  });
};
