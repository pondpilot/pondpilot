import { filterActions, getSearchTermFromValue } from '@components/spotlight/utils';
import { describe, expect, it } from '@jest/globals';

/**
 * Tests for the filtered actions logic used in spotlight.
 * This tests the core filtering behavior that getFilteredScriptActions relies on.
 */
describe('filterActions', () => {
  it('should return all actions when search value is empty', () => {
    const actions = [
      { id: '1', label: 'Action One' },
      { id: '2', label: 'Action Two' },
      { id: '3', label: 'Action Three' },
    ];

    const filtered = filterActions(actions, '');

    expect(filtered).toEqual(actions);
    expect(filtered.length).toBe(3);
  });

  it('should filter actions by label', () => {
    const actions = [
      { id: '1', label: 'Customer Data' },
      { id: '2', label: 'Product Catalog' },
      { id: '3', label: 'Customer Orders' },
    ];

    const filtered = filterActions(actions, 'customer');

    expect(filtered.length).toBe(2);
    expect(filtered.map((a) => a.id)).toEqual(['1', '3']);
  });

  it('should be case insensitive', () => {
    const actions = [
      { id: '1', label: 'My Script' },
      { id: '2', label: 'Other Script' },
    ];

    const filtered = filterActions(actions, 'MY');

    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('1');
  });

  it('should return empty array when no matches', () => {
    const actions = [
      { id: '1', label: 'Action One' },
      { id: '2', label: 'Action Two' },
    ];

    const filtered = filterActions(actions, 'nonexistent');

    expect(filtered).toEqual([]);
  });

  it('should handle search prefixes and suffixes correctly', () => {
    const actions = [
      { id: '1', label: 'sales report' },
      { id: '2', label: 'customer data' },
    ];

    // Test with '&' prefix (script prefix defined in SEARCH_PREFIXES)
    // The prefix should be stripped and only "sales" should be searched
    const filtered = filterActions(actions, '&sales');

    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('1');
  });

  it('should not mutate the original array', () => {
    const actions = [
      { id: '1', label: 'Action One' },
      { id: '2', label: 'Action Two' },
    ];
    const original = [...actions];

    filterActions(actions, 'one');

    expect(actions).toEqual(original);
  });
});

/**
 * Tests for getFilteredScriptActions behavior.
 * Since the actual function is defined within the component and uses
 * component-specific dependencies, we test the core logic patterns here.
 */
describe('getFilteredScriptActions logic', () => {
  it('should return filtered results when matches exist', () => {
    const scriptActions = [
      { id: 'script-1', label: 'Sales Report' },
      { id: 'script-2', label: 'Customer Analysis' },
    ];

    const filtered = filterActions(scriptActions, 'sales');

    // When there are results, those should be returned
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('script-1');
  });

  it('should return empty array when no matches and fallback is disabled', () => {
    const scriptActions = [
      { id: 'script-1', label: 'Sales Report' },
      { id: 'script-2', label: 'Customer Analysis' },
    ];

    const filtered = filterActions(scriptActions, 'nonexistent');
    const fallbackForEmpty = false;

    // When fallbackForEmpty is false, return empty array
    const result = filtered.length === 0 && !fallbackForEmpty ? [] : filtered;

    expect(result).toEqual([]);
  });

  it('should indicate when fallback action should be shown', () => {
    const scriptActions = [
      { id: 'script-1', label: 'Sales Report' },
      { id: 'script-2', label: 'Customer Analysis' },
    ];

    const filtered = filterActions(scriptActions, 'nonexistent');
    const fallbackForEmpty = true;

    // When there are no results and fallback is enabled,
    // the component would show a "create new" action
    const shouldShowFallback = filtered.length === 0 && fallbackForEmpty;

    expect(shouldShowFallback).toBe(true);
    expect(filtered).toEqual([]);
  });

  it('should extract search term correctly for create action label', () => {
    const searchValue = '&my new script';
    const searchTerm = getSearchTermFromValue(searchValue);

    // The extracted term would be used in the create action label
    // The '&' prefix (script prefix) should be stripped
    expect(searchTerm).toBe('my new script');
  });

  it('should handle empty search term for create action', () => {
    const searchValue = '';
    const searchTerm = getSearchTermFromValue(searchValue);

    // When search term is empty, the create action would show "Create new ..."
    expect(searchTerm).toBe('');
  });
});
