import { matchSorter } from 'match-sorter';

import { SCRIPT_GROUP_DISPLAY_NAME, SEARCH_PREFIXES, SEARCH_SUFFIXES } from './consts';
import { SpotlightView } from './model';

/**
 * Default timestamp value for items that have never been used.
 * Using NEGATIVE_INFINITY ensures they sort to the end when sorting by LRU.
 */
const DEFAULT_LAST_USED = Number.NEGATIVE_INFINITY;

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

export const filterActions = (
  actions: any[],
  searchValue: string,
  options?: { preserveOrder?: boolean },
) => {
  const searchTerm = getSearchTermFromValue(searchValue);

  if (!searchTerm) return actions;

  const matches = matchSorter(actions, searchTerm, {
    keys: ['label'],
  });

  if (!options?.preserveOrder) {
    return matches;
  }

  const matchSet = new Set(matches);
  return actions.filter((action) => matchSet.has(action));
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

/**
 * Sorts actions by LRU (Least Recently Used) based on lastUsed timestamp.
 * Items with more recent lastUsed timestamps appear first.
 * Items without lastUsed are sorted to the end.
 * When timestamps are equal, sorts alphabetically by label for stable ordering.
 *
 * @param actions - Array of actions with optional metadata containing lastUsed timestamp
 * @param tieBreaker - Optional function to determine order when lastUsed is equal
 * @returns Sorted array of actions
 * @throws {Error} If actions is not an array
 */
export const sortActionsByLRU = <T extends { metadata?: { lastUsed?: number }; label?: string }>(
  actions: T[],
  tieBreaker?: (a: T, b: T) => number,
): T[] => {
  // Input validation
  if (!Array.isArray(actions)) {
    throw new Error('sortActionsByLRU: actions must be an array');
  }

  return [...actions].sort((a, b) => {
    // Normalize lastUsed values to handle NaN/invalid cases
    const rawALastUsed = a.metadata?.lastUsed;
    const rawBLastUsed = b.metadata?.lastUsed;

    const aLastUsed: number = Number.isFinite(rawALastUsed)
      ? (rawALastUsed as number)
      : DEFAULT_LAST_USED;
    const bLastUsed: number = Number.isFinite(rawBLastUsed)
      ? (rawBLastUsed as number)
      : DEFAULT_LAST_USED;

    // Sort in descending order (most recent first)
    const timeDiff = bLastUsed - aLastUsed;

    // If timestamps differ and the difference is valid, use that for sorting
    // Note: NEGATIVE_INFINITY - NEGATIVE_INFINITY = NaN, so we check for that
    if (!Number.isNaN(timeDiff) && timeDiff !== 0) {
      return timeDiff;
    }

    // If timestamps are equal or both missing, use tie-breaker or default to label comparison
    if (tieBreaker) {
      return tieBreaker(a, b);
    }

    // Default tie-breaker: alphabetical by label
    const aLabel = a.label ?? '';
    const bLabel = b.label ?? '';
    return aLabel.localeCompare(bLabel);
  });
};
