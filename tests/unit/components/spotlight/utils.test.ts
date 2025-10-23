import { sortActionsByLRU } from '@components/spotlight/utils';
import { describe, expect, it } from '@jest/globals';

describe('sortActionsByLRU', () => {
  it('should sort actions by lastUsed in descending order (most recent first)', () => {
    const actions = [
      { id: '1', metadata: { lastUsed: 100 } },
      { id: '2', metadata: { lastUsed: 300 } },
      { id: '3', metadata: { lastUsed: 200 } },
    ];

    const sorted = sortActionsByLRU(actions);

    expect(sorted.map((a) => a.id)).toEqual(['2', '3', '1']);
    expect(sorted[0].metadata?.lastUsed).toBe(300);
    expect(sorted[1].metadata?.lastUsed).toBe(200);
    expect(sorted[2].metadata?.lastUsed).toBe(100);
  });

  it('should place items without lastUsed at the end', () => {
    const actions = [
      { id: '1', metadata: { lastUsed: 100 } },
      { id: '2', metadata: {} },
      { id: '3', metadata: { lastUsed: 200 } },
      { id: '4' },
    ];

    const sorted = sortActionsByLRU(actions);

    expect(sorted.map((a) => a.id)).toEqual(['3', '1', '2', '4']);
  });

  it('should handle all items without lastUsed', () => {
    const actions = [
      { id: '1', label: 'Charlie', metadata: {} },
      { id: '2', label: 'Alice' },
      { id: '3', label: 'Bob', metadata: {} },
    ];

    const sorted = sortActionsByLRU(actions);

    // When all have no lastUsed, should sort alphabetically by label
    expect(sorted.length).toBe(3);
    expect(sorted.map((a) => a.id)).toEqual(['2', '3', '1']);
    expect(sorted.map((a) => a.label)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('should handle empty array', () => {
    const actions: any[] = [];
    const sorted = sortActionsByLRU(actions);

    expect(sorted).toEqual([]);
  });

  it('should handle single item', () => {
    const actions = [{ id: '1', metadata: { lastUsed: 100 } }];
    const sorted = sortActionsByLRU(actions);

    expect(sorted).toEqual(actions);
  });

  it('should not mutate the original array', () => {
    const actions = [
      { id: '1', metadata: { lastUsed: 100 } },
      { id: '2', metadata: { lastUsed: 200 } },
    ];

    const original = [...actions];
    const sorted = sortActionsByLRU(actions);

    expect(actions).toEqual(original);
    expect(sorted).not.toBe(actions);
  });

  it('should handle items with same lastUsed timestamp', () => {
    const actions = [
      { id: '1', label: 'Zebra', metadata: { lastUsed: 100 } },
      { id: '2', label: 'Apple', metadata: { lastUsed: 100 } },
      { id: '3', label: 'Banana', metadata: { lastUsed: 200 } },
    ];

    const sorted = sortActionsByLRU(actions);

    expect(sorted[0].id).toBe('3');
    // Items with same timestamp should be sorted alphabetically by label
    expect(sorted[1].id).toBe('2'); // Apple
    expect(sorted[1].label).toBe('Apple');
    expect(sorted[2].id).toBe('1'); // Zebra
    expect(sorted[2].label).toBe('Zebra');
  });

  it('should handle items with lastUsed set to 0', () => {
    const actions = [
      { id: '1', metadata: { lastUsed: 0 } },
      { id: '2', metadata: { lastUsed: 100 } },
      { id: '3', metadata: {} },
    ];

    const sorted = sortActionsByLRU(actions);

    // lastUsed: 0 should be treated as an actual timestamp, not missing
    // but items without lastUsed (undefined) should come last
    expect(sorted.map((a) => a.id)).toEqual(['2', '1', '3']);
  });

  it('should work with complex metadata objects', () => {
    const actions = [
      { id: '1', label: 'First', metadata: { lastUsed: 100, other: 'data' } },
      { id: '2', label: 'Second', metadata: { lastUsed: 300 } },
      { id: '3', label: 'Third', metadata: { lastUsed: 200, foo: 'bar' } },
    ];

    const sorted = sortActionsByLRU(actions);

    expect(sorted[0].id).toBe('2');
    expect(sorted[0].label).toBe('Second');
    expect(sorted[1].id).toBe('3');
    expect(sorted[2].id).toBe('1');
  });

  it('should use custom tie-breaker when provided', () => {
    const actions = [
      { id: '1', label: 'First', priority: 3, metadata: { lastUsed: 100 } },
      { id: '2', label: 'Second', priority: 1, metadata: { lastUsed: 100 } },
      { id: '3', label: 'Third', priority: 2, metadata: { lastUsed: 100 } },
    ];

    // Custom tie-breaker that sorts by priority
    const sorted = sortActionsByLRU(
      actions,
      (a, b) => (a as any).priority - (b as any).priority,
    );

    // All have same lastUsed, so should be sorted by priority
    expect(sorted[0].id).toBe('2'); // priority 1
    expect(sorted[1].id).toBe('3'); // priority 2
    expect(sorted[2].id).toBe('1'); // priority 3
  });

  it('should use default alphabetical tie-breaker when no custom tie-breaker provided', () => {
    const actions = [
      { id: '1', label: 'Zebra', metadata: { lastUsed: 100 } },
      { id: '2', label: 'Apple', metadata: { lastUsed: 100 } },
      { id: '3', label: 'Mango', metadata: { lastUsed: 100 } },
    ];

    const sorted = sortActionsByLRU(actions);

    // Should be sorted alphabetically by label
    expect(sorted.map((a) => a.label)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('should handle items with missing labels in tie-breaker', () => {
    const actions = [
      { id: '1', metadata: { lastUsed: 100 } },
      { id: '2', label: 'Apple', metadata: { lastUsed: 100 } },
      { id: '3', metadata: { lastUsed: 100 } },
    ];

    const sorted = sortActionsByLRU(actions);

    // Items without labels should be treated as empty strings and come first
    expect(sorted.length).toBe(3);
    expect(sorted.find((a) => a.id === '2')?.label).toBe('Apple');
  });

  it('should handle NaN lastUsed values', () => {
    const actions = [
      { id: '1', label: 'First', metadata: { lastUsed: NaN } },
      { id: '2', label: 'Second', metadata: { lastUsed: 100 } },
      { id: '3', label: 'Third', metadata: { lastUsed: NaN } },
    ];

    const sorted = sortActionsByLRU(actions);

    // NaN values should be treated as missing and items should be sorted to the end alphabetically
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1'); // First comes before Third alphabetically
    expect(sorted[2].id).toBe('3');
  });

  it('should handle Infinity lastUsed values', () => {
    const actions = [
      { id: '1', label: 'First', metadata: { lastUsed: Infinity } },
      { id: '2', label: 'Second', metadata: { lastUsed: 100 } },
      { id: '3', label: 'Third', metadata: { lastUsed: -Infinity } },
    ];

    const sorted = sortActionsByLRU(actions);

    // Number.isFinite(Infinity) = false, so Infinity is treated as missing
    // Number.isFinite(-Infinity) = false, so -Infinity is also treated as missing
    // So item 2 with lastUsed=100 should be first, then items 1 and 3 sorted alphabetically
    expect(sorted[0].id).toBe('2'); // lastUsed: 100
    expect(sorted[1].id).toBe('1'); // First comes before Third alphabetically
    expect(sorted[2].id).toBe('3');
  });

  it('should throw error for non-array input', () => {
    expect(() => {
      sortActionsByLRU(null as any);
    }).toThrow('sortActionsByLRU: actions must be an array');

    expect(() => {
      sortActionsByLRU(undefined as any);
    }).toThrow('sortActionsByLRU: actions must be an array');

    expect(() => {
      sortActionsByLRU({ id: '1' } as any);
    }).toThrow('sortActionsByLRU: actions must be an array');

    expect(() => {
      sortActionsByLRU('not an array' as any);
    }).toThrow('sortActionsByLRU: actions must be an array');
  });
});
