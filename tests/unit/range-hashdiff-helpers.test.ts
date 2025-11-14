import {
  calculateSplitFactor,
  determineEffectiveDepth,
} from '@features/comparison/algorithms/range-hashdiff/executor';
import { PriorityQueue } from '@features/comparison/algorithms/range-hashdiff/priority-queue';
import { describe, expect, it } from '@jest/globals';

describe('PriorityQueue', () => {
  it('returns items in descending priority order', () => {
    const pq = new PriorityQueue<{ size: number }>((a, b) => a.size > b.size);
    pq.push({ size: 10 });
    pq.push({ size: 5 });
    pq.push({ size: 20 });

    expect(pq.pop()).toEqual({ size: 20 });
    expect(pq.pop()).toEqual({ size: 10 });
    expect(pq.pop()).toEqual({ size: 5 });
    expect(pq.pop()).toBeNull();
  });
});

describe('determineEffectiveDepth', () => {
  const baseOptions = {
    rowThreshold: 100_000,
    splitFactor: 4,
    maxDepth: 6,
  } as const;

  it('returns zero depth when dataset fits in a single bucket', () => {
    const depth = determineEffectiveDepth(50_000, baseOptions);
    expect(depth).toBe(0);
  });

  it('caps depth at configured max depth', () => {
    const depth = determineEffectiveDepth(50_000_000, baseOptions);
    expect(depth).toBeLessThanOrEqual(baseOptions.maxDepth);
  });
});

describe('calculateSplitFactor', () => {
  it('returns zero when maxCount under threshold', () => {
    expect(calculateSplitFactor(10_000, 100_000, 4)).toBe(0);
  });

  it('never returns less than two when splitting', () => {
    expect(calculateSplitFactor(150_000, 100_000, 4)).toBe(2);
  });

  it('does not exceed base split factor', () => {
    expect(calculateSplitFactor(1_000_000, 100_000, 4)).toBe(4);
  });
});
