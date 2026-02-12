import {
  buildAvailableCellNames,
  buildResolvedDependencyGraph,
  computeCellDependencies,
  detectCircularDependencyCells,
} from '@features/notebook/utils/dependencies';
import { describe, expect, it } from '@jest/globals';
import { NotebookCell } from '@models/notebook';

const makeSqlCell = (
  id: string,
  order: number,
  content: string,
  name: string | null = null,
): NotebookCell => ({
  id: id as any,
  ref: `__pp_cell_${id}` as any,
  name,
  type: 'sql',
  content,
  order,
});

describe('notebook dependencies', () => {
  it('keeps stable references valid after reorder', () => {
    const source = makeSqlCell('source', 1, 'SELECT 1 AS v', 'source_alias');
    const downstream = makeSqlCell('downstream', 0, 'SELECT v FROM source_alias', null);
    const cells = [downstream, source];

    const available = buildAvailableCellNames(cells);
    const deps = computeCellDependencies(cells, available);
    const resolved = buildResolvedDependencyGraph(cells, deps);

    expect(resolved.unresolvedReferences.size).toBe(0);
    expect(resolved.duplicateNameCells.size).toBe(0);
    expect(resolved.edges.get(downstream.id)).toEqual(new Set([source.id]));
  });

  it('flags duplicate aliases as reference conflicts', () => {
    const first = makeSqlCell('a', 0, 'SELECT 1', 'dup');
    const second = makeSqlCell('b', 1, 'SELECT 2', 'dup');
    const consumer = makeSqlCell('c', 2, 'SELECT * FROM dup');
    const cells = [first, second, consumer];

    const available = buildAvailableCellNames(cells);
    const deps = computeCellDependencies(cells, available);
    const resolved = buildResolvedDependencyGraph(cells, deps);

    expect(resolved.duplicateNameCells).toEqual(new Set([first.id, second.id]));
    expect(resolved.unresolvedReferences.get(consumer.id)).toEqual(['dup']);
  });

  it('flags unresolved references', () => {
    const consumer = makeSqlCell('c', 0, 'SELECT * FROM __pp_cell_missing');
    const cells = [consumer];

    const available = buildAvailableCellNames(cells);
    const deps = computeCellDependencies(cells, available);
    const resolved = buildResolvedDependencyGraph(cells, deps);

    expect(resolved.unresolvedReferences.get(consumer.id)).toEqual(['__pp_cell_missing']);
  });

  it('detects dependency cycles', () => {
    const a = makeSqlCell('a', 0, 'SELECT * FROM b_ref', 'a_ref');
    const b = makeSqlCell('b', 1, 'SELECT * FROM a_ref', 'b_ref');
    const cells = [a, b];

    const available = buildAvailableCellNames(cells);
    const deps = computeCellDependencies(cells, available);
    const resolved = buildResolvedDependencyGraph(cells, deps);
    const cycle = detectCircularDependencyCells(resolved.edges);

    expect(cycle).toEqual(new Set([a.id, b.id]));
  });
});
