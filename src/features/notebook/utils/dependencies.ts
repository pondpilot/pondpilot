import { NotebookCell } from '@models/notebook';
import { ensureCellRef } from '@utils/notebook';

import { extractCellReferences, normalizeCellName } from './cell-naming';

export type CellDependencyMap = Map<string, string[]>;

function getProvidedNames(cell: NotebookCell): Set<string> {
  const names = new Set<string>();
  if (cell.type !== 'sql') return names;

  names.add(ensureCellRef(cell.id, cell.ref));
  const userName = normalizeCellName(cell.name);
  if (userName) names.add(userName);

  return names;
}

export function buildAvailableCellNames(sortedCells: NotebookCell[]): Set<string> {
  const names = new Set<string>();
  sortedCells.forEach((cell) => {
    const provided = getProvidedNames(cell);
    for (const name of provided) {
      names.add(name);
    }
  });
  return names;
}

export function computeCellDependencies(
  sortedCells: NotebookCell[],
  availableNames: Set<string>,
): CellDependencyMap {
  const deps = new Map<string, string[]>();

  for (let i = 0; i < sortedCells.length; i += 1) {
    const cell = sortedCells[i];
    if (cell.type !== 'sql') continue;

    const ownNames = getProvidedNames(cell);
    const namesExcludingSelf = new Set([...availableNames].filter((name) => !ownNames.has(name)));
    const refs = extractCellReferences(cell.content, namesExcludingSelf);
    if (refs.length > 0) {
      deps.set(cell.id, refs);
    }
  }

  return deps;
}

export type ResolvedDependencyGraph = {
  edges: Map<string, Set<string>>;
  duplicateNameCells: Set<string>;
  unresolvedReferences: Map<string, string[]>;
};

export function buildResolvedDependencyGraph(
  sortedCells: NotebookCell[],
  dependencies: CellDependencyMap,
): ResolvedDependencyGraph {
  const nameToProviderCellIds = new Map<string, Set<string>>();
  const duplicateNameCells = new Set<string>();

  sortedCells.forEach((cell) => {
    if (cell.type !== 'sql') return;
    const provided = getProvidedNames(cell);
    for (const rawName of provided) {
      const name = rawName.toLowerCase();
      if (!nameToProviderCellIds.has(name)) {
        nameToProviderCellIds.set(name, new Set<string>());
      }
      const providers = nameToProviderCellIds.get(name)!;
      if (providers.size > 0 && !providers.has(cell.id)) {
        for (const providerCellId of providers) {
          duplicateNameCells.add(providerCellId);
        }
        duplicateNameCells.add(cell.id);
      }
      providers.add(cell.id);
    }
  });

  const edges = new Map<string, Set<string>>();
  const unresolvedReferences = new Map<string, string[]>();

  sortedCells.forEach((cell) => {
    if (cell.type !== 'sql') return;
    const refs = dependencies.get(cell.id) ?? [];
    if (!edges.has(cell.id)) edges.set(cell.id, new Set<string>());
    const unresolvedForCell: string[] = [];

    for (const ref of refs) {
      const providers = nameToProviderCellIds.get(ref.toLowerCase());
      if (!providers || providers.size === 0) {
        unresolvedForCell.push(ref);
        continue;
      }

      if (providers.size > 1) {
        unresolvedForCell.push(ref);
        continue;
      }

      const providerCellId = [...providers][0];
      if (providerCellId === cell.id) continue;
      edges.get(cell.id)?.add(providerCellId);
    }

    if (unresolvedForCell.length > 0) {
      unresolvedReferences.set(cell.id, unresolvedForCell);
    }
  });

  return { edges, duplicateNameCells, unresolvedReferences };
}

export function detectCircularDependencyCells(
  graph: Map<string, Set<string>>,
): Set<string> {
  const visitState = new Map<string, 'visiting' | 'visited'>();
  const path: string[] = [];
  const cyclicCells = new Set<string>();

  const visit = (cellId: string) => {
    visitState.set(cellId, 'visiting');
    path.push(cellId);

    const deps = graph.get(cellId);
    if (deps) {
      for (const depId of deps) {
        const depState = visitState.get(depId);
        if (depState === 'visiting') {
          const cycleStart = path.indexOf(depId);
          if (cycleStart >= 0) {
            for (let i = cycleStart; i < path.length; i += 1) {
              cyclicCells.add(path[i]);
            }
          }
          cyclicCells.add(depId);
        } else if (depState !== 'visited') {
          visit(depId);
        }
      }
    }

    path.pop();
    visitState.set(cellId, 'visited');
  };

  for (const cellId of graph.keys()) {
    if (!visitState.has(cellId)) {
      visit(cellId);
    }
  }

  return cyclicCells;
}

export function findCellsReferencingTargetCell(
  targetCellId: string,
  sortedCells: NotebookCell[],
  dependencies: CellDependencyMap,
): string[] {
  const { edges } = buildResolvedDependencyGraph(sortedCells, dependencies);
  const refs: string[] = [];

  for (const [cellId, deps] of edges.entries()) {
    if (cellId === targetCellId) continue;
    if (deps.has(targetCellId)) refs.push(cellId);
  }

  return refs;
}

export function findStaleCells(
  executedCellId: string,
  sortedCells: NotebookCell[],
  dependencies: CellDependencyMap,
): Set<string> {
  const { edges } = buildResolvedDependencyGraph(sortedCells, dependencies);

  // Reverse graph: provider -> consumers
  const consumersByProvider = new Map<string, Set<string>>();
  for (const [consumerId, providers] of edges.entries()) {
    for (const providerId of providers) {
      if (!consumersByProvider.has(providerId)) {
        consumersByProvider.set(providerId, new Set<string>());
      }
      consumersByProvider.get(providerId)?.add(consumerId);
    }
  }

  const staleCellIds = new Set<string>();
  const queue = [...(consumersByProvider.get(executedCellId) ?? [])];

  while (queue.length > 0) {
    const cellId = queue.shift();
    if (!cellId || staleCellIds.has(cellId)) continue;
    staleCellIds.add(cellId);
    const nextConsumers = consumersByProvider.get(cellId);
    if (nextConsumers) {
      queue.push(...nextConsumers);
    }
  }

  return staleCellIds;
}
