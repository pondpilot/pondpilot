import {
  buildAvailableCellNames,
  buildResolvedDependencyGraph,
  computeCellDependencies,
  computeCellDependenciesWithLineage,
  detectCircularDependencyCells,
  findDownstreamDependencyCells,
  findUpstreamDependencyCells,
} from '@features/notebook/utils/dependencies';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotebookCell } from '@models/notebook';

import { getFlowScopeClient } from '../../../../src/workers/flowscope-client';

type AnalyzeFn = (
  sql: string,
  schema?: unknown,
  dialect?: string,
) => Promise<Record<string, unknown>>;

const analyzeMock = jest.fn() as jest.MockedFunction<AnalyzeFn>;

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
  beforeEach(() => {
    analyzeMock.mockReset();
    (getFlowScopeClient() as any).analyze = (
      sql: string,
      schema?: unknown,
      dialect?: string,
    ) => analyzeMock(sql, schema, dialect);
  });

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

  it('collects upstream dependencies for a target cell', () => {
    const source = makeSqlCell('source', 0, 'SELECT 1 AS x', 'source_alias');
    const mid = makeSqlCell('mid', 1, 'SELECT x + 1 AS x FROM source_alias', 'mid_alias');
    const target = makeSqlCell('target', 2, 'SELECT x + 1 AS x FROM mid_alias', null);
    const unrelated = makeSqlCell('unrelated', 3, 'SELECT 99 AS x', 'other_alias');
    const cells = [source, mid, target, unrelated];

    const available = buildAvailableCellNames(cells);
    const deps = computeCellDependencies(cells, available);
    const resolved = buildResolvedDependencyGraph(cells, deps);

    expect(findUpstreamDependencyCells(target.id, resolved.edges)).toEqual(
      new Set([source.id, mid.id, target.id]),
    );
  });

  it('collects downstream dependencies for a target cell', () => {
    const source = makeSqlCell('source', 0, 'SELECT 1 AS x', 'source_alias');
    const mid = makeSqlCell('mid', 1, 'SELECT x + 1 AS x FROM source_alias', 'mid_alias');
    const target = makeSqlCell('target', 2, 'SELECT x + 1 AS x FROM mid_alias', null);
    const unrelated = makeSqlCell('unrelated', 3, 'SELECT 99 AS x', 'other_alias');
    const cells = [source, mid, target, unrelated];

    const available = buildAvailableCellNames(cells);
    const deps = computeCellDependencies(cells, available);
    const resolved = buildResolvedDependencyGraph(cells, deps);

    expect(findDownstreamDependencyCells(source.id, resolved.edges)).toEqual(
      new Set([source.id, mid.id, target.id]),
    );
  });

  it('uses FlowScope lineage to compute dependencies', async () => {
    const source = makeSqlCell('source', 0, 'SELECT 1 AS x', 'source_alias');
    const consumer = makeSqlCell('consumer', 1, 'SELECT * FROM source_alias');
    const cells = [source, consumer];
    const available = buildAvailableCellNames(cells);

    analyzeMock
      .mockResolvedValueOnce({
        summary: { hasErrors: false },
        statements: [{ nodes: [] }],
      } as any)
      .mockResolvedValueOnce({
        summary: { hasErrors: false },
        statements: [{ nodes: [{ type: 'table', label: 'source_alias' }] }],
      } as any);

    const deps = await computeCellDependenciesWithLineage(cells, available);
    expect(deps.get(consumer.id)).toEqual(['source_alias']);
  });

  it('falls back to lexical extraction when FlowScope returns no lineage nodes', async () => {
    const source = makeSqlCell('source', 0, 'SELECT 1 AS x', 'source_alias');
    const consumer = makeSqlCell('consumer', 1, 'SELECT * FROM source_alias');
    const cells = [source, consumer];
    const available = buildAvailableCellNames(cells);

    analyzeMock
      .mockResolvedValueOnce({
        summary: { hasErrors: false },
        statements: [{ nodes: [] }],
      } as any)
      .mockResolvedValueOnce({
        summary: { hasErrors: false },
        statements: [{ nodes: [] }],
      } as any);

    const deps = await computeCellDependenciesWithLineage(cells, available);
    expect(deps.get(consumer.id)).toEqual(['source_alias']);
  });

  it('falls back to lexical extraction when FlowScope analysis fails', async () => {
    const source = makeSqlCell('source', 0, 'SELECT 1 AS x', 'source_alias');
    const consumer = makeSqlCell('consumer', 1, 'SELECT * FROM source_alias');
    const cells = [source, consumer];
    const available = buildAvailableCellNames(cells);

    analyzeMock.mockRejectedValue(new Error('analysis unavailable'));

    const deps = await computeCellDependenciesWithLineage(cells, available);
    expect(deps.get(consumer.id)).toEqual(['source_alias']);
  });
});
